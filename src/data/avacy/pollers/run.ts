import * as dotenv from 'dotenv';
import { getSecrets } from '@jumpgroup/secret-fetcher';
import { writeFileSync, existsSync } from 'fs';

// Carica env dalla root del progetto (default .env)
dotenv.config();

async function loadSecrets() {
  const groupKey = process.env.GROUP_KEY;
  const groupSecret = process.env.GROUP_SECRET;

  if (groupKey && groupSecret) {
    console.log('🔐 Loading secrets from @jumpgroup/secret-fetcher...');
    
    // Crea un file .secret-fetcher temporaneo se non esiste, necessario per la libreria
    if (!existsSync('.secret-fetcher')) {
      console.log('📝 Creating temporary .secret-fetcher file...');
      writeFileSync('.secret-fetcher', `GROUP_KEY=${groupKey}\nGROUP_SECRET=${groupSecret}`);
    }

    try {
      const secrets = await getSecrets({
        groupKey,
        groupSecret,
        // env: 'production' // Se omesso, ritorna tutti i secrets o mergedVariables
      });

      // Appiattisci i secrets in process.env
      // getSecrets ritorna un oggetto con i secrets, che potrebbero essere annidati per ambiente se `env` è specificato
      // o un oggetto mergiato se no. Dalla lettura del codice sorgente della libreria:
      // Se env non è specificato: result = mergedVariables; dove mergedVariables è { key: value, ... } (o { key: { ...props } })
      // La libreria parsa il YAML nella nota.
      
      // Ispezioniamo la struttura ritornata.
      // Se result è tipo { "VAPOR_RDS_HOST": { value: "..." }, ... } o direttamente { "VAPOR_RDS_HOST": "..." }
      // Il codice sorgente faceva: itemProperties = yaml.loadAll(item.note)[0]; tagToObjectMap[newTag] = { ...itemProperties };
      // Quindi tagToObjectMap è { "tag": { key: value, ... } }? No.
      // result.forEach(item => item.tags.forEach(tag => ... tagToObjectMap[tag] = ... ))
      // Quindi ritorna un oggetto dove le chiavi sono i tag (es. "production", "staging", o nomi delle app)
      // e i valori sono gli oggetti definiti nel YAML della nota.
      
      // Assumiamo che ci sia un tag che corrisponde al nostro ambiente o "common".
      // O che vogliamo caricare tutto.
      
      // Se il segreto è salvato con tag "avacy" o simile.
      // Proviamo a stampare le chiavi disponibili se non sappiamo cosa c'è.
      
      // Per ora proviamo a fare merge di tutto quello che troviamo nel primo livello che sembra una variabile d'ambiente
      
      Object.entries(secrets).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
           // Probabilmente un raggruppamento per ambiente/tag
           Object.entries(value).forEach(([subKey, subValue]) => {
             if (typeof subValue === 'string' || typeof subValue === 'number') {
               process.env[subKey] = String(subValue);
             }
           });
        } else if (typeof value === 'string' || typeof value === 'number') {
           process.env[key] = String(value);
        }
      });
      
      console.log('✅ Secrets loaded into process.env');
      
    } catch (e) {
      console.warn('⚠️ Failed to load secrets:', e);
    }
  } else {
    console.warn('⚠️ GROUP_KEY or GROUP_SECRET missing in .env. Skipping secret fetch.');
  }
}

async function main() {
  await loadSecrets();

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

  if (arg === 'vapor:leaderboard') {
    const { fetchLeaderboard } = await import('./vapor/leaderboard');
    await fetchLeaderboard();
    console.log('Done: vapor:leaderboard');
    return;
  }

  console.error(`Poller sconosciuto: ${arg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});