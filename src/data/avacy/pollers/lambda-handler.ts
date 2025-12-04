import * as dotenv from 'dotenv';
import type { Context } from 'aws-lambda';
import * as fs from 'fs';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';

// Carica env dalla root del progetto (default .env)
dotenv.config();

/**
 * Lambda handler generico per eseguire i poller
 * 
 * Event format:
 * {
 *   "poller": "stripe:new-subscriptions" | "stripe:cancellations" | ...
 * }
 */
export async function handler(event: { poller: string }, context: Context) {
	const pollerName = event.poller || (event as any).pollerName;
	
	if (!pollerName) {
		throw new Error('Missing "poller" parameter in event');
	}

	console.log(`[Lambda] Executing poller: ${pollerName}`);

	// Fetch secrets in real-time
	const groupKey = process.env.GROUP_KEY;
	const groupSecret = process.env.GROUP_SECRET;
	const envName = process.env.SECRETS_ENV || 'production';

	if (groupKey && groupSecret) {
		try {
			// Create dummy .secret-fetcher file for secret-fetcher library requirement
			// Lambda filesystem is read-only, so we can only write to /tmp
			const secretFetcherPath = '/tmp/.secret-fetcher';
			if (!fs.existsSync(secretFetcherPath)) {
				fs.writeFileSync(secretFetcherPath, '');
			}
			
			// Change to /tmp directory temporarily since library looks for .secret-fetcher in current dir
			const originalCwd = process.cwd();
			process.chdir('/tmp');

			console.log(`[Lambda] Fetching secrets for env: ${envName}...`);
			const secrets = await getSecrets({
				groupKey,
				groupSecret,
				env: envName
			});
			
			// Restore original directory
			process.chdir(originalCwd);

			const envSecrets = secrets[envName];
			if (envSecrets) {
				console.log(`[Lambda] Secrets fetched successfully. Injecting into process.env...`);
				// Filter out AWS credentials - Lambda should use IAM role, not static credentials
				const filteredSecrets = { ...envSecrets };
				delete filteredSecrets.AWS_ACCESS_KEY_ID;
				delete filteredSecrets.AWS_SECRET_ACCESS_KEY;
				delete filteredSecrets.AWS_LAMBDA_ROLE_ARN; // Not needed at runtime
				delete filteredSecrets.CLOUDFRONT_DISTRIBUTION_ID; // Not needed at runtime
				Object.assign(process.env, filteredSecrets);
				console.log(`[Lambda] Injected ${Object.keys(filteredSecrets).length} secrets (AWS credentials excluded)`);
			} else {
				console.warn(`[Lambda] No secrets found for env: ${envName}`);
			}
		} catch (error) {
			console.error(`[Lambda] Failed to fetch secrets:`, error);
			throw error; // Fail hard if secrets cannot be loaded
		}
	} else {
		console.log('[Lambda] No GROUP_KEY/GROUP_SECRET provided, skipping secret fetcher.');
	}

	const startTime = Date.now();

	try {
		// Mapping poller (stesso di run.ts)
		if (pollerName === 'stripe:new-subscriptions') {
			const { fetchNewSubscriptions } = await import('./stripe');
			await fetchNewSubscriptions();
			console.log('Done: stripe:new-subscriptions');
		} else if (pollerName === 'stripe:cancellations') {
			const { fetchCancellations } = await import('./stripe');
			await fetchCancellations();
			console.log('Done: stripe:cancellations');
		} else if (pollerName === 'monday:enterprise-accounts') {
			const { fetchEnterpriseAccounts } = await import('./monday/enterprise-accounts');
			await fetchEnterpriseAccounts();
			console.log('Done: monday:enterprise-accounts');
		} else if (pollerName === 'active-campaign:contacts') {
			const { fetchActiveCampaignContacts } = await import('./active-campaign/contacts');
			await fetchActiveCampaignContacts();
			console.log('Done: active-campaign:contacts');
		} else if (pollerName === 'vapor:tenants') {
			const { fetchVaporTenants } = await import('./vapor/tenants');
			await fetchVaporTenants();
			console.log('Done: vapor:tenants');
		} else if (pollerName === 'vapor:users-funnel') {
			const { fetchUsersFunnel } = await import('./vapor/users-funnel');
			await fetchUsersFunnel();
			console.log('Done: vapor:users-funnel');
		} else if (pollerName === 'vapor:leaderboard') {
			const { fetchLeaderboard } = await import('./vapor/leaderboard');
			await fetchLeaderboard();
			console.log('Done: vapor:leaderboard');
		} else {
			throw new Error(`Unknown poller: ${pollerName}`);
		}

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


