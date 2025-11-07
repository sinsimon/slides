import * as dotenv from 'dotenv';

// Carica env dalla root del progetto (default .env)
dotenv.config();

async function main() {
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

  console.error(`Poller sconosciuto: ${arg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});