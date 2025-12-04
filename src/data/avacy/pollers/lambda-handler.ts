import type { Context } from 'aws-lambda';
import * as fs from 'fs';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

type PollerName = 
	| 'stripe:new-subscriptions'
	| 'stripe:cancellations'
	| 'monday:enterprise-accounts'
	| 'active-campaign:contacts'
	| 'vapor:tenants'
	| 'vapor:users-funnel'
	| 'vapor:leaderboard';

async function loadSecrets(groupKey: string, groupSecret: string, envName: string): Promise<Record<string, string>> {
	console.log(`[Lambda] Fetching secrets for env: ${envName}...`);

	// Crea file .secret-fetcher in /tmp (Lambda filesystem è read-only)
	const secretFetcherPath = '/tmp/.secret-fetcher';
	try {
		fs.writeFileSync(secretFetcherPath, '');
	} catch (e) {
		// Ignora se già esiste
	}

	// Cambia temporaneamente a /tmp perché la libreria cerca .secret-fetcher nella directory corrente
	const originalCwd = process.cwd();
	process.chdir('/tmp');

	try {
		const secrets = await getSecrets({
			groupKey,
			groupSecret,
			env: envName,
		});

		// Ripristina directory originale
		process.chdir(originalCwd);

		const envSecrets = secrets[envName] || {};
		console.log(`[Lambda] Loaded ${Object.keys(envSecrets).length} secrets`);
		return envSecrets;
	} catch (error) {
		process.chdir(originalCwd);
		console.error(`[Lambda] Failed to fetch secrets:`, error);
		throw error;
	}
}

async function saveJsonS3(relativePath: string, data: unknown, bucket: string, region: string): Promise<void> {
	const s3Client = new S3Client({ region });
	const s3Key = `data/avacy/json/${relativePath}`;
	const body = JSON.stringify(data, null, 2);

	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: s3Key,
			Body: body,
			ContentType: 'application/json',
		})
	);

	console.log(`[Lambda] ✓ Saved to S3: s3://${bucket}/${s3Key}`);
}

async function runPoller(
	pollerName: PollerName,
	vars: Record<string, string>,
	bucket: string,
	region: string
): Promise<void> {
	console.log(`[Lambda] Running poller: ${pollerName}`);

	if (pollerName === 'stripe:new-subscriptions') {
		const { fetchNewSubscriptions } = await import('./stripe');
		const result = await fetchNewSubscriptions({ STRIPE_API_KEY: vars.STRIPE_API_KEY });
		await saveJsonS3('stripe/new-subscriptions.json', result, bucket, region);
		return;
	}

	if (pollerName === 'stripe:cancellations') {
		const { fetchCancellations } = await import('./stripe');
		const result = await fetchCancellations({ STRIPE_API_KEY: vars.STRIPE_API_KEY });
		await saveJsonS3('stripe/cancellations.json', result, bucket, region);
		return;
	}

	if (pollerName === 'monday:enterprise-accounts') {
		const { fetchEnterpriseAccounts } = await import('./monday/enterprise-accounts');
		const result = await fetchEnterpriseAccounts({ MONDAY_API_KEY: vars.MONDAY_API_KEY });
		await saveJsonS3('monday/new-subscriptions.json', result['new-subscriptions'], bucket, region);
		await saveJsonS3('monday/cancellations.json', result.cancellations, bucket, region);
		return;
	}

	if (pollerName === 'active-campaign:contacts') {
		const { fetchActiveCampaignContacts } = await import('./active-campaign/contacts');
		const result = await fetchActiveCampaignContacts({
			ACTIVE_CAMPAIGN_API_URL: vars.ACTIVE_CAMPAIGN_API_URL,
			ACTIVE_CAMPAIGN_API_KEY: vars.ACTIVE_CAMPAIGN_API_KEY,
		});
		await saveJsonS3('active-campaign/contacts.json', result, bucket, region);
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
		await saveJsonS3('vapor/tenants.json', result, bucket, region);
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
		await saveJsonS3('vapor/users-funnel.json', result, bucket, region);
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
		await saveJsonS3('vapor/leaderboard.json', result, bucket, region);
		return;
	}

	throw new Error(`Unknown poller: ${pollerName}`);
}

export async function handler(event: { poller: string }, context: Context) {
	const pollerName = event.poller || (event as any).pollerName;

	if (!pollerName) {
		throw new Error('Missing "poller" parameter in event');
	}

	console.log(`[Lambda] Executing poller: ${pollerName}`);

	const startTime = Date.now();

	// Carica GROUP_KEY e GROUP_SECRET da variabili d'ambiente (hardcodate nel deploy)
	const groupKey = process.env.GROUP_KEY;
	const groupSecret = process.env.GROUP_SECRET;
	const envName = process.env.SECRETS_ENV || 'production';
	const bucket = process.env.AWS_S3_BUCKET;
	const region = process.env.AWS_REGION || 'eu-central-1';

	if (!groupKey || !groupSecret) {
		throw new Error('Missing GROUP_KEY or GROUP_SECRET in Lambda environment');
	}

	if (!bucket) {
		throw new Error('Missing AWS_S3_BUCKET in Lambda environment');
	}

	try {
		// Carica secrets
		const secrets = await loadSecrets(groupKey, groupSecret, envName);
		const vars = { ...process.env, ...secrets } as Record<string, string>;

		// Esegui poller
		await runPoller(pollerName as PollerName, vars, bucket, region);

		const duration = Date.now() - startTime;
		console.log(`[Lambda] Poller ${pollerName} completed successfully in ${duration}ms`);

		return {
			statusCode: 200,
			body: JSON.stringify({
				success: true,
				poller: pollerName,
				durationMs: duration,
			}),
		};
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`[Lambda] Poller ${pollerName} failed after ${duration}ms:`, error);

		return {
			statusCode: 500,
			body: JSON.stringify({
				success: false,
				poller: pollerName,
				error: error.message || String(error),
				durationMs: duration,
			}),
		};
	}
}
