import * as dotenv from 'dotenv';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Carica env dalla root del progetto
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type PollerName = 
	| 'stripe:new-subscriptions'
	| 'stripe:cancellations'
	| 'monday:enterprise-accounts'
	| 'active-campaign:contacts'
	| 'vapor:tenants'
	| 'vapor:users-funnel'
	| 'vapor:leaderboard'
	| 'rai:subscriptions';

async function loadSecrets() {
	const groupKey = process.env.GROUP_KEY;
	const groupSecret = process.env.GROUP_SECRET;
	const envName = process.env.SECRETS_ENV || 'production';

	if (!groupKey || !groupSecret) {
		console.warn('⚠️  GROUP_KEY or GROUP_SECRET missing. Using process.env only.');
		return {};
	}

	console.log('🔐 Loading secrets from @jumpgroup/secret-fetcher...');

	// Crea file .secret-fetcher se necessario
	const secretFetcherPath = join(process.cwd(), '.secret-fetcher');
	try {
		writeFileSync(secretFetcherPath, '');
	} catch (e) {
		// Ignora se già esiste
	}

	try {
		const secrets = await getSecrets({
			groupKey,
			groupSecret,
			env: envName,
		});

		const envSecrets = secrets[envName] || {};
		console.log(`✅ Loaded ${Object.keys(envSecrets).length} secrets`);
		return envSecrets;
	} catch (e) {
		console.warn('⚠️  Failed to load secrets:', e);
		return {};
	}
}

function saveJsonLocal(relativePath: string, data: unknown): void {
	const outputPath = join(process.cwd(), 'src', 'data', 'avacy', 'json', relativePath);
	const outputDir = dirname(outputPath);
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
	console.log(`✓ Saved: ${relativePath}`);
}

async function runPoller(pollerName: PollerName, vars: Record<string, string>): Promise<void> {
	console.log(`\n🚀 Running poller: ${pollerName}`);

	if (pollerName === 'stripe:new-subscriptions') {
		const { fetchNewSubscriptions } = await import('./stripe');
		const result = await fetchNewSubscriptions({ STRIPE_API_KEY: vars.STRIPE_API_KEY });
		saveJsonLocal('stripe/new-subscriptions.json', result);
		return;
	}

	if (pollerName === 'stripe:cancellations') {
		const { fetchCancellations } = await import('./stripe');
		const result = await fetchCancellations({ STRIPE_API_KEY: vars.STRIPE_API_KEY });
		saveJsonLocal('stripe/cancellations.json', result);
		return;
	}

	if (pollerName === 'monday:enterprise-accounts') {
		const { fetchEnterpriseAccounts } = await import('./monday/enterprise-accounts');
		const result = await fetchEnterpriseAccounts({ MONDAY_API_KEY: vars.MONDAY_API_KEY });
		saveJsonLocal('monday/new-subscriptions.json', result['new-subscriptions']);
		saveJsonLocal('monday/cancellations.json', result.cancellations);
		return;
	}

	if (pollerName === 'active-campaign:contacts') {
		const { fetchActiveCampaignContacts } = await import('./active-campaign/contacts');
		const result = await fetchActiveCampaignContacts({
			ACTIVE_CAMPAIGN_API_URL: vars.ACTIVE_CAMPAIGN_API_URL,
			ACTIVE_CAMPAIGN_API_KEY: vars.ACTIVE_CAMPAIGN_API_KEY,
		});
		saveJsonLocal('active-campaign/contacts.json', result);
		return;
	}

	if (pollerName === 'vapor:tenants') {
		const { fetchVaporTenants } = await import('./vapor/tenants');
		const result = await fetchVaporTenants({
			VAPOR_RDS_HOST: vars.VAPOR_RDS_HOST,
			VAPOR_RDS_PORT: vars.VAPOR_RDS_PORT || '3306',
			VAPOR_RDS_USER: vars.VAPOR_RDS_USER,
			VAPOR_RDS_PASSWORD: vars.VAPOR_RDS_PASSWORD,
			VAPOR_RDS_DATABASE: vars.VAPOR_RDS_DATABASE,
			STRIPE_API_KEY: vars.STRIPE_API_KEY,
		});
		saveJsonLocal('vapor/tenants.json', result);
		return;
	}

	if (pollerName === 'vapor:users-funnel') {
		const { fetchUsersFunnel } = await import('./vapor/users-funnel');
		const result = await fetchUsersFunnel({
			VAPOR_RDS_HOST: vars.VAPOR_RDS_HOST,
			VAPOR_RDS_PORT: vars.VAPOR_RDS_PORT || '3306',
			VAPOR_RDS_USER: vars.VAPOR_RDS_USER,
			VAPOR_RDS_PASSWORD: vars.VAPOR_RDS_PASSWORD,
			VAPOR_RDS_DATABASE: vars.VAPOR_RDS_DATABASE,
			STRIPE_API_KEY: vars.STRIPE_API_KEY,
		});
		saveJsonLocal('vapor/users-funnel.json', result);
		return;
	}

	if (pollerName === 'vapor:leaderboard') {
		const { fetchLeaderboard } = await import('./vapor/leaderboard');
		const result = await fetchLeaderboard({
			VAPOR_RDS_HOST: vars.VAPOR_RDS_HOST,
			VAPOR_RDS_PORT: vars.VAPOR_RDS_PORT || '3306',
			VAPOR_RDS_USER: vars.VAPOR_RDS_USER,
			VAPOR_RDS_PASSWORD: vars.VAPOR_RDS_PASSWORD,
			VAPOR_RDS_DATABASE: vars.VAPOR_RDS_DATABASE,
			STRIPE_API_KEY: vars.STRIPE_API_KEY,
		});
		saveJsonLocal('vapor/leaderboard.json', result);
		return;
	}

	if (pollerName === 'rai:subscriptions') {
		const { fetchRaiSubscriptions, fetchRaiCancellations } = await import('./rai/subscriptions');
		const newSubs = await fetchRaiSubscriptions();
		const cancellations = await fetchRaiCancellations();
		saveJsonLocal('rai/new-subscriptions.json', newSubs);
		saveJsonLocal('rai/cancellations.json', cancellations);
		return;
	}

	throw new Error(`Unknown poller: ${pollerName}`);
}

async function main() {
	const args = process.argv.slice(2);
	const pollerArg = args[0];

	if (!pollerArg) {
		console.error('Usage: npm run poll -- <poller-name>');
		console.error('Available pollers:');
		console.error('  - stripe:new-subscriptions');
		console.error('  - stripe:cancellations');
		console.error('  - monday:enterprise-accounts');
		console.error('  - active-campaign:contacts');
		console.error('  - vapor:tenants');
		console.error('  - vapor:users-funnel');
		console.error('  - vapor:leaderboard');
		console.error('  - rai:subscriptions');
		console.error('\nOr use "all" to run all pollers');
		process.exit(1);
	}

	const secrets = await loadSecrets();
	const vars = { ...process.env, ...secrets } as Record<string, string>;

	if (pollerArg === 'all') {
		const allPollers: PollerName[] = [
			'stripe:new-subscriptions',
			'stripe:cancellations',
			'monday:enterprise-accounts',
			'active-campaign:contacts',
			'vapor:tenants',
			'vapor:users-funnel',
			'vapor:leaderboard',
			'rai:subscriptions',
		];

		for (const poller of allPollers) {
			try {
				await runPoller(poller, vars);
			} catch (e) {
				console.error(`❌ Error running ${poller}:`, e);
			}
		}
	} else {
		await runPoller(pollerArg as PollerName, vars);
	}

	console.log('\n✅ Done!');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
