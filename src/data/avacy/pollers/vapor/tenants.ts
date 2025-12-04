import { fetch } from 'undici';
import { createVaporPool } from '../../db/client';
import { Pool } from 'mysql2/promise';

export type VaporPollVars = {
	VAPOR_RDS_HOST: string;
	VAPOR_RDS_PORT: string;
	VAPOR_RDS_USER: string;
	VAPOR_RDS_PASSWORD: string;
	VAPOR_RDS_DATABASE: string;
	STRIPE_API_KEY: string;
};

type StripePrice = {
	id: string;
	nickname?: string | null;
	product?: string | StripeProduct;
	unit_amount?: number | null;
	currency?: string;
	recurring?: {
		interval?: 'month' | 'year' | 'day' | 'week';
		interval_count?: number;
	} | null;
};

type StripeProduct = {
	id: string;
	name?: string;
	description?: string | null;
};

type StripePriceResponse = StripePrice & {
	product?: string | StripeProduct;
};

async function getPlanFromStripe(priceId: string, stripeApiKey: string): Promise<string> {
	try {
		const url = `https://api.stripe.com/v1/prices/${priceId}?expand[]=product`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${stripeApiKey}` },
		});

		if (!res.ok) return 'Unknown';

		const price = (await res.json()) as StripePriceResponse;
		if (price.nickname && price.nickname.trim().length > 0) return price.nickname.trim();
		
		if (price.product) {
			const product = typeof price.product === 'string' 
				? await getProductFromStripe(price.product, stripeApiKey)
				: price.product;
			
			if (product?.name && product.name.trim().length > 0) return product.name.trim();
		}
		
		return 'Unknown';
	} catch {
		return 'Unknown';
	}
}

async function getProductFromStripe(productId: string, stripeApiKey: string): Promise<StripeProduct | null> {
	try {
		const url = `https://api.stripe.com/v1/products/${productId}`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${stripeApiKey}` },
		});
		if (!res.ok) return null;
		return (await res.json()) as StripeProduct;
	} catch {
		return null;
	}
}

function normalizePlanName(planName: string): string {
	const lower = planName.toLowerCase();
	if (lower.includes('free')) return 'Free';
	if (lower.includes('basic')) return 'Basic';
	if (lower.includes('plus')) return 'Plus';
	if (lower.includes('premium')) return 'Premium';
	if (lower.includes('enterprise')) return 'Enterprise';
	return planName;
}

// Funzione helper per fetchare i domini dal DB tenant
async function fetchTenantDomains(pool: Pool, dbName: string): Promise<{ count: number, names: string | null }> {
    try {
        // Sanitizzazione base: assicuriamoci che dbName sia alfanumerico o contenga caratteri sicuri
        // Ma viene dal DB quindi ci fidiamo (relativamente). Usiamo backticks.
        const query = `SELECT COUNT(*) as c, GROUP_CONCAT(url SEPARATOR ', ') as urls FROM \`${dbName}\`.domains`;
        const [rows] = await pool.query(query) as any[];
        return {
            count: Number(rows[0].c || 0),
            names: rows[0].urls || null
        };
    } catch (e: any) {
        // Se la tabella non esiste o il DB non è accessibile, restituisci 0
        // console.warn(`Could not fetch domains for ${dbName}: ${e.message}`);
        return { count: 0, names: null };
    }
}

export async function fetchVaporTenants(vars: VaporPollVars): Promise<Array<{
	id: string;
	createdAt: string | null;
	name: string;
	email: string | null;
	plan: string;
	hasOnlyTestMail: boolean;
	webspaces: { count: number; names: string | null };
	users: { count: number };
}>> {
	const stripeApiKey = vars.STRIPE_API_KEY;
	const pool = createVaporPool({
		host: vars.VAPOR_RDS_HOST,
		port: parseInt(vars.VAPOR_RDS_PORT, 10),
		user: vars.VAPOR_RDS_USER,
		password: vars.VAPOR_RDS_PASSWORD,
		database: vars.VAPOR_RDS_DATABASE,
	});

	console.log('=== Vapor RDS: fetch tenants ===');

	try {
		// 1. Fetch Tenants dal DB Centrale
		const [tenants] = await pool.query(`
			SELECT 
				t.id as tenant_id,
				t.created_at as tenant_created_at,
                t.data->>'$.tenancy_db_name' as db_name,
				COALESCE(
					(SELECT u.email FROM users_teams uteam 
					 INNER JOIN users u ON u.id = uteam.user_id 
					 WHERE uteam.tenant_id = t.id AND u.email IS NOT NULL AND u.email != '' 
					 LIMIT 1),
					t.data->>'$.email'
				) as email,
				t.data->>'$.first_name' as first_name,
				t.data->>'$.last_name' as last_name,
				t.data->>'$.business_name' as business_name,
				t.data->>'$.bundle_limits' as bundle_limits,
				s.id as subscription_id,
				s.stripe_price,
				s.stripe_status,
				-- Domini centrali (opzionali, manteniamo per backward compatibility o info extra)
				GROUP_CONCAT(DISTINCT d.domain ORDER BY d.domain SEPARATOR ', ') as central_domains,
				-- Users Count (dal DB centrale)
				(SELECT COUNT(*) FROM users_teams ut WHERE ut.tenant_id = t.id) as users_count,
				-- Tutte le email del tenant (per calcolare hasOnlyTestMail)
				GROUP_CONCAT(DISTINCT u.email ORDER BY u.email SEPARATOR ', ') as all_emails
			FROM tenants t
			LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.stripe_status != 'canceled'
			LEFT JOIN domains d ON d.tenant_id = t.id
			LEFT JOIN users_teams uteam ON uteam.tenant_id = t.id
			LEFT JOIN users u ON u.id = uteam.user_id AND u.email IS NOT NULL AND u.email != ''
			GROUP BY t.id, t.created_at, t.data->>'$.tenancy_db_name', t.data->>'$.first_name', t.data->>'$.last_name', t.data->>'$.business_name', t.data->>'$.bundle_limits', s.id, s.stripe_price, s.stripe_status
			ORDER BY t.created_at DESC
		`) as any[];

		console.log(`Total tenants: ${tenants.length}`);

		// 2. Fetch Piani Stripe (Cache & Parallel)
		const priceToPlan = new Map<string, string>();
		const uniquePrices = new Set<string>();
		tenants.forEach((t: any) => {
			if (t.stripe_price && t.stripe_status === 'active') {
				uniquePrices.add(t.stripe_price);
			}
		});

		console.log(`Fetching ${uniquePrices.size} piani da Stripe...`);
		const priceArray = Array.from(uniquePrices);
        // Fetch stripe prices in batches
		for (let i = 0; i < priceArray.length; i++) {
			if (i > 0 && i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 1000));
			const priceId = priceArray[i];
			priceToPlan.set(priceId, normalizePlanName(await getPlanFromStripe(priceId, stripeApiKey)));
		}
		console.log(`✓ Piani mappati`);

        // 3. Fetch Webspaces (Domains) dai DB Tenant
        console.log('Fetching webspaces from tenant DBs...');
        // Mappa tenant_id -> { count, names }
        const webspacesMap = new Map<string, { count: number, names: string | null }>();
        
        // Batch concurrency per DB queries
        const BATCH_SIZE = 20;
        for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
            const batch = tenants.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (t: any) => {
                if (t.db_name) {
                    const res = await fetchTenantDomains(pool, t.db_name);
                    webspacesMap.set(t.tenant_id, res);
                }
            }));
            // Piccolo delay per non saturare connessioni se necessario, ma con 5 conn limit nel pool mysql2 gestisce la coda
            if (i % 100 === 0) console.log(`Processati ${i}/${tenants.length} DB...`);
        }
        console.log('✓ Webspaces fetch complete');


		// 4. Costruzione Output Finale
		const cleanTenants = tenants.map((tenant: any) => {
			let plan = 'Free';
			if (tenant.bundle_limits) {
				plan = 'Enterprise';
			} else if (tenant.stripe_price && tenant.stripe_status && tenant.stripe_status !== 'canceled') {
				plan = priceToPlan.get(tenant.stripe_price) || 'Free';
			}

            const businessName = tenant.business_name || '';
            const fullName = [tenant.first_name, tenant.last_name].filter(Boolean).join(' ');
            const name = businessName || fullName || tenant.email || 'Unknown';
            
            const webData = webspacesMap.get(tenant.tenant_id) || { count: 0, names: null };

			// Calcola hasOnlyTestMail: true solo se OGNI email è di test
			const allEmails = tenant.all_emails 
				? tenant.all_emails.split(',').map((e: string) => e.trim()).filter((e: string) => e)
				: [];
			
			// Se non ci sono email, considera false (non è un tenant di test)
			let hasOnlyTestMail = false;
			if (allEmails.length > 0) {
				// Controlla che TUTTE le email siano di test
				hasOnlyTestMail = allEmails.every((email: string) => 
					email.endsWith('@jumpgroup.it') || email.endsWith('@avacysolution.com')
				);
			}

			return {
				id: tenant.tenant_id,
				createdAt: tenant.tenant_created_at ? new Date(tenant.tenant_created_at).toISOString() : null,
				name: name,
				email: tenant.email || null,
				plan: plan,
				hasOnlyTestMail: hasOnlyTestMail,
				// domains rimosso
                webspaces: {
                    count: webData.count,
                    names: webData.names // Domini "reali" dal tenant DB (URL)
                },
                users: {
                    count: Number(tenant.users_count || 0)
                }
			};
		});

		return cleanTenants;
	} finally {
		await pool.end();
	}
}

export default fetchVaporTenants;
