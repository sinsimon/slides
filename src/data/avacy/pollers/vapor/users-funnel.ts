import { createVaporPool } from '../../db/client';
import { fetch } from 'undici';
import * as dotenv from 'dotenv';

dotenv.config();

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var ${name}`);
	}
	return value;
}

type TenantFunnelData = {
	tenantId: string | null; // null per utenti senza tenant (usano email come ID)
	tenantName?: string | null;
	tenantCreatedAt?: string | null;
	tenantMemberCount?: number | null;
	plan?: string | null;
	domains?: string | null;
	hasWebspace: boolean;
	webspaceCount: number;
	isNonFree: boolean;
	// Per tenant: array di email. Per utenti senza tenant: array con una sola email
	emails: string[];
	// Data di registrazione più vecchia tra gli utenti del tenant
	registeredAt: string;
	// Se almeno un utente ha verificato l'email
	emailVerified: boolean;
};

// Cache per i nomi dei piani Stripe
const priceToPlan = new Map<string, string>();

/**
 * Fetches Stripe product name from price ID.
 */
async function getPlanFromStripe(priceId: string, apiKey: string): Promise<string> {
	if (priceToPlan.has(priceId)) {
		return priceToPlan.get(priceId)!;
	}

	const url = `https://api.stripe.com/v1/prices/${priceId}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!res.ok) {
		const text = await res.text();
		console.warn(`Stripe error fetching price ${priceId}: ${res.status} - ${text}`);
		return 'Unknown';
	}
	const body = (await res.json()) as { product?: string; nickname?: string };

	if (body.nickname) {
		priceToPlan.set(priceId, body.nickname);
		return body.nickname;
	}

	if (body.product) {
		const productUrl = `https://api.stripe.com/v1/products/${body.product}`;
		const productRes = await fetch(productUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
		if (!productRes.ok) {
			const text = await productRes.text();
			console.warn(`Stripe error fetching product ${body.product}: ${productRes.status} - ${text}`);
			return 'Unknown';
		}
		const productBody = (await productRes.json()) as { name?: string };
		if (productBody.name) {
			priceToPlan.set(priceId, productBody.name);
			return productBody.name;
		}
	}
	return 'Unknown';
}

/**
 * Determines the plan (Free, Basic, Plus) from the Stripe plan name
 */
function normalizePlanName(planName: string): string {
	const lower = planName.toLowerCase();
	if (lower.includes('free')) return 'Free';
	if (lower.includes('basic')) return 'Basic';
	if (lower.includes('plus')) return 'Plus';
	if (lower.includes('premium')) return 'Premium';
	if (lower.includes('enterprise')) return 'Enterprise';
	return planName; // Returns original name if no match
}

export async function fetchUsersFunnel(): Promise<void> {
	const stripeApiKey = getEnv('STRIPE_API_KEY');
	const pool = createVaporPool();

	console.log('=== Vapor RDS: fetch users funnel data ===');

	try {
		// Estrai tutti gli utenti con le loro informazioni di funnel
		// Usa users_teams invece di users_tenants (users_tenants è deprecato)
		const [users] = await pool.query(`
			SELECT 
				u.id,
				u.email,
				u.first_name,
				u.last_name,
				u.created_at as registered_at,
				u.email_verified_at,
				-- Tenant info (da users_teams)
				uteam.tenant_id,
				t.created_at as tenant_created_at,
				COALESCE(
					t.data->>'$.business_name',
					CONCAT(COALESCE(t.data->>'$.first_name', ''), ' ', COALESCE(t.data->>'$.last_name', ''))
				) as tenant_name,
				t.data->>'$.bundle_limits' as bundle_limits,
				t.data->>'$.tenancy_db_name' as tenancy_db_name,
				-- Webspace info
				MIN(uw.created_at) as first_webspace_created_at,
				COUNT(DISTINCT uw.id) as webspace_count,
				-- Subscription info
				s.stripe_status as subscription_status,
				s.stripe_price as subscription_price
			FROM users u
			LEFT JOIN users_teams uteam ON uteam.user_id = u.id
			LEFT JOIN tenants t ON t.id = uteam.tenant_id
			LEFT JOIN users_webspaces uw ON uw.tenant_id = t.id AND uw.user_email = u.email
			LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.stripe_status != 'canceled'
			WHERE u.email NOT LIKE '%@jumpgroup.it' AND u.email NOT LIKE '%@avacysolution.com'
			GROUP BY 
				u.id, u.email, u.first_name, u.last_name, u.created_at, u.email_verified_at,
				uteam.tenant_id, t.created_at, t.data->>'$.business_name', t.data->>'$.first_name', t.data->>'$.last_name',
				t.data->>'$.bundle_limits', t.data->>'$.tenancy_db_name', s.stripe_status, s.stripe_price
			ORDER BY u.created_at DESC
		`) as any[];

		// Calcola il numero di membri per ogni tenant
		const tenantMemberCounts = new Map<string, number>();
		if (users.length > 0) {
			const tenantIds = [...new Set(users.map((u: any) => u.tenant_id).filter(Boolean))];
			for (const tenantId of tenantIds) {
				const [countResult] = await pool.query(
					`SELECT COUNT(*) as count FROM users_teams WHERE tenant_id = ?`,
					[tenantId]
				) as any[];
				tenantMemberCounts.set(tenantId, countResult[0]?.count || 0);
			}
		}

		console.log(`Total users (esclusi @jumpgroup.it e @avacysolution.com): ${users.length}`);

		// Raccogli tutti i price_id unici per le chiamate Stripe
		const uniquePriceIds = new Set<string>();
		users.forEach((user: any) => {
			if (user.subscription_price && user.subscription_status !== 'canceled') {
				uniquePriceIds.add(user.subscription_price);
			}
		});

		// Fetch i nomi dei piani da Stripe in parallelo
		const planPromises: Promise<void>[] = [];
		for (const priceId of uniquePriceIds) {
			const promise = getPlanFromStripe(priceId, stripeApiKey).then(plan => {
				priceToPlan.set(priceId, normalizePlanName(plan));
			});
			planPromises.push(promise);
		}

		await Promise.all(planPromises);
		console.log(`✓ Piani mappati: ${priceToPlan.size}`);

		// Estrai domini dagli schema tenant (multitenant)
		// Raccogli tutti i tenancy_db_name unici
		const tenantDbNames = new Map<string, string>(); // tenant_id -> tenancy_db_name
		users.forEach((user: any) => {
			if (user.tenant_id && user.tenancy_db_name) {
				tenantDbNames.set(user.tenant_id, user.tenancy_db_name);
			}
		});

		console.log(`📦 Estrazione domini da ${tenantDbNames.size} schema tenant...`);

		// Mappa tenant_id -> domini (array di stringhe)
		const tenantDomains = new Map<string, string[]>();

		// Funzione per estrarre domini da uno schema tenant
		const fetchTenantDomains = async (tenantId: string, dbName: string): Promise<void> => {
			try {
				const [domains] = await pool.query(`
					SELECT url 
					FROM \`${dbName}\`.domains
					WHERE url IS NOT NULL AND url != ''
					ORDER BY url
				`) as any[];

				if (domains.length > 0) {
					const domainUrls = domains.map((d: any) => d.url.trim()).filter(Boolean);
					tenantDomains.set(tenantId, domainUrls);
				}
			} catch (error: any) {
				// Schema non esiste o tabella non accessibile - ignora silenziosamente
				if (error.code !== 'ER_BAD_DB_ERROR' && error.code !== 'ER_NO_SUCH_TABLE') {
					console.warn(`⚠️  Errore estrazione domini per tenant ${tenantId} (${dbName}):`, error.message);
				}
			}
		};

		// Esegui query in parallelo (batch di 20 alla volta per non sovraccaricare il DB)
		const dbNameEntries = Array.from(tenantDbNames.entries());
		const batchSize = 20;
		for (let i = 0; i < dbNameEntries.length; i += batchSize) {
			const batch = dbNameEntries.slice(i, i + batchSize);
			await Promise.all(
				batch.map(([tenantId, dbName]) => fetchTenantDomains(tenantId, dbName))
			);
			if (i + batchSize < dbNameEntries.length) {
				// Piccola pausa tra i batch per non sovraccaricare il DB
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}

		const totalDomains = Array.from(tenantDomains.values()).reduce((sum, domains) => sum + domains.length, 0);
		console.log(`✓ Domini estratti: ${totalDomains} da ${tenantDomains.size} tenant`);

		// Raggruppa utenti per tenant_id
		const tenantsMap = new Map<string | null, any[]>();
		
		users.forEach((user: any) => {
			const tenantId = user.tenant_id || null;
			if (!tenantsMap.has(tenantId)) {
				tenantsMap.set(tenantId, []);
			}
			tenantsMap.get(tenantId)!.push(user);
		});

		// Converti in formato strutturato: tenant come unità principale
		const funnelData: TenantFunnelData[] = [];

		for (const [tenantId, tenantUsers] of tenantsMap.entries()) {
			if (tenantId === null) {
				// Utenti senza tenant: crea una entry per ogni utente
				tenantUsers.forEach((user: any) => {
					funnelData.push({
						tenantId: null,
						tenantName: null,
						tenantCreatedAt: null,
						tenantMemberCount: null,
						plan: null,
						domains: null,
						hasWebspace: false,
						webspaceCount: 0,
						isNonFree: false,
						emails: [user.email],
						registeredAt: user.registered_at ? new Date(user.registered_at).toISOString() : '',
						emailVerified: !!user.email_verified_at,
					});
				});
			} else {
				// Tenant con utenti: crea una sola entry per tenant
				const firstUser = tenantUsers[0];
				
				// Determina il piano (stesso per tutti gli utenti del tenant)
				let plan: string | null = null;
				if (firstUser.bundle_limits) {
					plan = 'Enterprise';
				} else if (firstUser.subscription_price && firstUser.subscription_status !== 'canceled') {
					plan = priceToPlan.get(firstUser.subscription_price) || 'Free';
				} else {
					plan = 'Free';
				}

				// Considera non free se:
				// 1. Ha bundle_limits (Enterprise) OPPURE
				// 2. Ha subscription non cancellata
				const isNonFree = !!(firstUser.bundle_limits) || 
					!!(firstUser.subscription_status && firstUser.subscription_status !== 'canceled');

				// Estrai domini per questo tenant
				const domainsForTenant = tenantDomains.get(tenantId) || [];
				const domainsString = domainsForTenant.length > 0 ? domainsForTenant.join(', ') : null;

				// Raccogli tutte le email degli utenti del tenant
				const emails = tenantUsers.map((u: any) => u.email).filter(Boolean);

				// Data di registrazione più vecchia
				const registeredDates = tenantUsers
					.map((u: any) => u.registered_at ? new Date(u.registered_at).getTime() : Infinity)
					.filter((d: number) => d !== Infinity);
				const oldestRegisteredAt = registeredDates.length > 0 
					? new Date(Math.min(...registeredDates)).toISOString() 
					: '';

				// Se almeno un utente ha verificato l'email
				const emailVerified = tenantUsers.some((u: any) => !!u.email_verified_at);

				// Se almeno un utente ha webspace
				const hasWebspace = tenantUsers.some((u: any) => u.webspace_count > 0);
				const webspaceCount = tenantUsers.reduce((sum: number, u: any) => sum + (u.webspace_count || 0), 0);

				funnelData.push({
					tenantId: tenantId,
					tenantName: firstUser.tenant_name ? firstUser.tenant_name.trim() : null,
					tenantCreatedAt: firstUser.tenant_created_at ? new Date(firstUser.tenant_created_at).toISOString() : null,
					tenantMemberCount: tenantMemberCounts.get(tenantId) || null,
					plan: plan,
					domains: domainsString,
					hasWebspace: hasWebspace,
					webspaceCount: webspaceCount,
					isNonFree: isNonFree,
					emails: emails,
					registeredAt: oldestRegisteredAt,
					emailVerified: emailVerified,
				});
			}
		}

		// Calcola statistiche aggregate
		// Per le statistiche, contiamo gli utenti (non i tenant) per mantenere la coerenza
		const totalUsers = users.length;
		const usersWithEmailVerified = users.filter((u: any) => !!u.email_verified_at).length;
		const usersWithTenant = users.filter((u: any) => !!u.tenant_id).length;
		const usersWithWebspace = users.filter((u: any) => u.webspace_count > 0).length;
		const usersNonFree = users.filter((u: any) => {
			const isNonFree = (u.bundle_limits) || (u.subscription_status && u.subscription_status !== 'canceled');
			return isNonFree;
		}).length;

		const stats = {
			total: totalUsers,
			emailVerified: usersWithEmailVerified,
			hasTenant: usersWithTenant,
			hasWebspace: usersWithWebspace,
			isNonFree: usersNonFree,
		};

		const payload = {
			fetchedAt: new Date().toISOString(),
			stats: {
				...stats,
				conversionRates: {
					emailVerification: stats.total > 0 ? ((stats.emailVerified / stats.total) * 100).toFixed(2) + '%' : '0%',
					tenantCreation: stats.total > 0 ? ((stats.hasTenant / stats.total) * 100).toFixed(2) + '%' : '0%',
					webspaceCreation: stats.total > 0 ? ((stats.hasWebspace / stats.total) * 100).toFixed(2) + '%' : '0%',
					nonFreeConversion: stats.total > 0 ? ((stats.isNonFree / stats.total) * 100).toFixed(2) + '%' : '0%',
				},
			},
			tenants: funnelData,
		};

		const { saveJsonFile } = await import('../s3-utils');
		await saveJsonFile('vapor/users-funnel.json', payload);
		console.log(`✓ Saved ${funnelData.length} users funnel data`);
		console.log(`\n📊 Statistiche:`);
		console.log(`  Totale utenti: ${stats.total}`);
		console.log(`  Email verificate: ${stats.emailVerified} (${((stats.emailVerified / stats.total) * 100).toFixed(1)}%)`);
		console.log(`  Con tenant: ${stats.hasTenant} (${((stats.hasTenant / stats.total) * 100).toFixed(1)}%)`);
		console.log(`  Con webspace: ${stats.hasWebspace} (${((stats.hasWebspace / stats.total) * 100).toFixed(1)}%)`);
		console.log(`  Non free: ${stats.isNonFree} (${((stats.isNonFree / stats.total) * 100).toFixed(1)}%)`);
	} finally {
		await pool.end();
	}
}

export default fetchUsersFunnel;

