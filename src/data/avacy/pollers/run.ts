import * as dotenv from 'dotenv';
import * as fs from 'fs';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';

// Carica env dalla root del progetto (default .env)
dotenv.config();

async function main() {
  // Fetch secrets locally if configured
  const groupKey = process.env.GROUP_KEY;
  const groupSecret = process.env.GROUP_SECRET;
  const envName = process.env.SECRETS_ENV || 'production';

  if (groupKey && groupSecret) {
    try {
        // Create dummy .secret-fetcher file for local dev if it doesn't exist
        // This is required by the secret-fetcher library
        if (!fs.existsSync('.secret-fetcher')) {
            fs.writeFileSync('.secret-fetcher', '');
        }

      console.log(`[Local] Fetching secrets for env: ${envName}...`);
      const secrets = await getSecrets({
        groupKey,
        groupSecret,
        env: envName
      });
      const envSecrets = secrets[envName];
      if (envSecrets) {
        console.log(`[Local] Secrets fetched. Injecting into process.env...`);
        Object.assign(process.env, envSecrets);
      }
      
      // Cleanup dummy file if we created it
      // fs.unlinkSync('.secret-fetcher'); 
    } catch (err) {
      console.warn(`[Local] Failed to fetch secrets:`, err);
      // Continue, maybe vars are in .env
    }
  }

  const arg = process.argv[2] || '';
  if (!arg) {
    console.error('Usage: npm run poll -- <poller[:task]>');
    process.exit(1);
  }

  // Mapping poller
  if (arg === 'stripe:new-subscriptions') {
    const { fetchNewSubscriptions } = await import('./stripe');
    await fetchNewSubscriptions();
    console.log('Done: stripe:new-subscriptions');
    return;
  }

  if (arg === 'stripe:cancellations') {
    const { fetchCancellations } = await import('./stripe');
    await fetchCancellations();
    console.log('Done: stripe:cancellations');
    return;
  }

  if (arg === 'monday:enterprise-accounts') {
    const { fetchEnterpriseAccounts } = await import('./monday/enterprise-accounts');
    await fetchEnterpriseAccounts();
    console.log('Done: monday:enterprise-accounts');
    return;
  }

  if (arg === 'active-campaign:contacts') {
    const { fetchActiveCampaignContacts } = await import('./active-campaign/contacts');
    await fetchActiveCampaignContacts();
    console.log('Done: active-campaign:contacts');
    return;
  }

  if (arg === 'vapor:tenants') {
    const { fetchVaporTenants } = await import('./vapor/tenants');
    await fetchVaporTenants();
    console.log('Done: vapor:tenants');
    return;
  }

  if (arg === 'vapor:users-funnel') {
    const { fetchUsersFunnel } = await import('./vapor/users-funnel');
    await fetchUsersFunnel();
    console.log('Done: vapor:users-funnel');
    return;
  }

  console.error(`Poller sconosciuto: ${arg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});