import { fetch } from 'undici';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

type MondayColumnValue = {
  id: string;
  text?: string | null;
  value?: string | null; // JSON string for complex types
  linked_item_ids?: string[]; // Per BoardRelationValue
};

type MondayItem = {
  id: string;
  name: string;
  group?: {
    id: string;
    title: string;
  } | null;
  column_values: MondayColumnValue[];
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// Minimal mapping helper: convert column_values array into an object keyed by column id with {text, value}
function mapColumns(values: MondayColumnValue[]): Record<string, { text?: string | null; value?: string | null }> {
  const out: Record<string, { text?: string | null; value?: string | null }> = {};
  for (const cv of values) {
    out[cv.id] = { text: cv.text ?? null, value: cv.value ?? null };
  }
  return out;
}

export async function fetchEnterpriseAccounts(): Promise<void> {
  const apiKey = getEnv('MONDAY_API_KEY');
  // Board ID hardcoded per Enterprise Accounts
  const boardId = 3820670548;

  // TEST SEMPLICE: prima verifichiamo l'autenticazione con una query base
  console.log('=== TEST AUTENTICAZIONE ===');
  const testQuery = /* GraphQL */ `
    query {
      me {
        id
        name
        email
      }
    }
  `;

  console.log('API Key present:', !!apiKey, '(length:', apiKey?.length || 0, ')');
  console.log('API Key starts with:', apiKey?.substring(0, 20), '...');
  console.log('API Key ends with:', '...' + apiKey?.substring(apiKey.length - 10));
  
  // Prova senza Bearer, solo il token
  let authHeader = apiKey.trim();
  // Se inizia con "xxx" o altri prefissi, prova a rimuoverli
  if (authHeader.startsWith('xxx')) {
    authHeader = authHeader.substring(3);
    console.log('Removed "xxx" prefix, trying with:', authHeader.substring(0, 20), '...');
  }

  // Prova prima senza Bearer, poi con Bearer
  let testRes = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify({ query: testQuery }),
  });
  
  // Se fallisce, prova con Bearer
  if (!testRes.ok) {
    console.log('Trying with Bearer prefix...');
    testRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authHeader}`,
      },
      body: JSON.stringify({ query: testQuery }),
    });
  }

  const testText = await testRes.text();
  console.log('Test response status:', testRes.status);
  console.log('Test response body:', testText.substring(0, 500));
  
  if (!testRes.ok) {
    throw new Error(`Test authentication failed: ${testRes.status} - ${testText}`);
  }

  const testBody = JSON.parse(testText);
  if (testBody.errors) {
    console.error('Test errors:', JSON.stringify(testBody.errors, null, 2));
    throw new Error(`Test GraphQL errors: ${JSON.stringify(testBody.errors)}`);
  }

  console.log('✓ Autenticazione OK! Utente:', testBody.data?.me?.name || 'N/A');
  console.log('');

  // Ora procediamo con la query principale
  console.log('=== FETCH BOARD DATA ===');
  const query = /* GraphQL */ `
    query FetchEnterpriseAccounts($boardId: [ID!]) {
      boards (ids: $boardId) {
        id
        name
        groups {
          id
          title
        }
        columns {
          id
          title
          type
        }
        items_page(limit: 500) {
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              text
              value
              ... on BoardRelationValue {
                linked_item_ids
              }
            }
          }
          cursor
        }
      }
    }
  `;

  const variables = { boardId: [String(boardId)] }; // Monday usa ID come stringhe

  console.log('Board ID:', boardId);

  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader, // Usa lo stesso authHeader pulito del test
    },
    body: JSON.stringify({ query, variables }),
  });

  const responseText = await res.text();
  
  if (!res.ok) {
    console.error('Response status:', res.status);
    console.error('Response body:', responseText);
    throw new Error(`Monday error ${res.status}: ${responseText}`);
  }

  const body = JSON.parse(responseText) as {
    data?: {
      boards?: Array<{
        id: string;
        name: string;
        groups?: Array<{ id: string; title: string }>;
        columns?: Array<{ id: string; title: string; type: string }>;
        items_page?: { items?: MondayItem[]; cursor?: string | null };
      }>;
    };
    errors?: any;
  };

  if (body.errors) {
    throw new Error(`Monday GraphQL errors: ${JSON.stringify(body.errors)}`);
  }

  const board = body.data?.boards?.[0];
  const items = board?.items_page?.items ?? [];
  const groups = board?.groups ?? [];
  const columns = board?.columns ?? [];
  
  // Crea una mappa columnId -> columnTitle per facilitare la ricerca
  const columnMap = new Map<string, string>();
  columns.forEach((col) => {
    columnMap.set(col.id, col.title);
  });
  
  console.log(`\nBoard: ${board?.name || 'N/A'}`);
  console.log(`Columns: ${columns.length}`);
  console.log(`Groups: ${groups.length}`);
  console.log('\nTutte le colonne disponibili:');
  columns.forEach((col) => {
    console.log(`  - ${col.title} (${col.id}, type: ${col.type})`);
  });
  
  // Trova gli ID delle colonne importanti per AVACY
  const findColumnId = (title: string): string | null => {
    const col = columns.find((c) => c.title.toLowerCase().includes(title.toLowerCase()));
    return col?.id || null;
  };
  
  const anagraficaColId = findColumnId('Anagrafica Clienti');
  
  // Raccogli tutti i linked_item_ids dai record AVACY per risolvere i nomi dei clienti
  const linkedItemIds = new Set<string>();
  items.forEach((it) => {
    if (it.group?.title === 'AVACY' && anagraficaColId) {
      const relationCol = it.column_values?.find((cv) => cv.id === anagraficaColId);
      if (relationCol) {
        // Prova prima linked_item_ids diretto (da fragment BoardRelationValue)
        if (relationCol.linked_item_ids && Array.isArray(relationCol.linked_item_ids)) {
          relationCol.linked_item_ids.forEach((id: string) => linkedItemIds.add(id));
        }
        // Altrimenti prova dal value JSON
        else if (relationCol.value) {
          try {
            const relationValue = JSON.parse(relationCol.value);
            if (relationValue.linked_item_ids && Array.isArray(relationValue.linked_item_ids)) {
              relationValue.linked_item_ids.forEach((id: string) => linkedItemIds.add(id));
            }
          } catch (e) {
            // Ignora errori di parsing
          }
        }
      }
    }
  });
  
  // Query per risolvere i nomi degli items collegati
  let linkedItemsMap = new Map<string, string>();
  if (linkedItemIds.size > 0) {
    console.log(`\nRisolvendo ${linkedItemIds.size} linked items per Anagrafica Clienti...`);
    const linkedItemsQuery = /* GraphQL */ `
      query GetLinkedItems($itemIds: [ID!]) {
        items (ids: $itemIds) {
          id
          name
        }
      }
    `;
    
    const linkedItemsRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        query: linkedItemsQuery,
        variables: { itemIds: Array.from(linkedItemIds) },
      }),
    });
    
    if (linkedItemsRes.ok) {
      const linkedItemsBody = await linkedItemsRes.json() as {
        data?: { items?: Array<{ id: string; name: string }> };
        errors?: any;
      };
      
      if (linkedItemsBody.data?.items) {
        linkedItemsBody.data.items.forEach((item) => {
          linkedItemsMap.set(item.id, item.name);
        });
        console.log(`✓ Risolti ${linkedItemsMap.size} nomi clienti`);
      }
    }
  }

  console.log(`\nBoard: ${board?.name || 'N/A'}`);
  console.log(`Groups: ${groups.length}`);
  groups.forEach((g) => {
    const itemsInGroup = items.filter((it) => it.group?.id === g.id);
    console.log(`  - ${g.title} (${itemsInGroup.length} items)`);
  });
  console.log(`Total items: ${items.length}\n`);

  // Trova gli ID delle colonne importanti per AVACY (già trovato sopra)
  const importoColId = findColumnId('importo');
  const meseScadenzaColId = findColumnId('Mese Scadenza');
  const col2024Id = findColumnId('2024');
  const col2025Id = findColumnId('2025');
  // stato_1 è l'ID della colonna, non il titolo - cerchiamo direttamente per ID o per titolo che contiene "Ammissibili"
  const stato1ColId = columns.find((c) => c.id === 'stato_1' || c.title.toLowerCase().includes('ammissibili'))?.id || null;
  // Piano: usa "Tipologia Avacy" (stato_14) che contiene il tipo di piano
  const pianoColId = findColumnId('Tipologia Avacy') || columns.find((c) => c.id === 'stato_14' || c.title.toLowerCase().includes('tipologia'))?.id || null;
  
  console.log('\nColumn mapping:');
  if (anagraficaColId) console.log(`  Anagrafica Clienti: ${anagraficaColId}`);
  if (importoColId) console.log(`  importo: ${importoColId}`);
  if (meseScadenzaColId) console.log(`  Mese Scadenza: ${meseScadenzaColId}`);
  if (col2024Id) console.log(`  2024: ${col2024Id}`);
  if (col2025Id) console.log(`  2025: ${col2025Id}`);
  if (stato1ColId) console.log(`  stato_1: ${stato1ColId}`);
  if (pianoColId) console.log(`  piano: ${pianoColId}`);

  // Output structure: keep raw plus a minimal normalized projection
  const records = items.map((it) => {
    const cols = mapColumns(it.column_values || []);
    const isAvacy = it.group?.title === 'AVACY';
    
    // Solo per AVACY: estrai i dati richiesti
    if (isAvacy) {
      // Nome cliente da "Anagrafica Clienti" (board_relation)
      let clienteName = null;
      if (anagraficaColId) {
        const relationCol = it.column_values?.find((cv) => cv.id === anagraficaColId);
        if (relationCol) {
          clienteName = relationCol.text || null;
          if (!clienteName && relationCol.linked_item_ids && relationCol.linked_item_ids.length > 0) {
            const firstLinkedId = relationCol.linked_item_ids[0];
            clienteName = linkedItemsMap.get(firstLinkedId) || null;
          } else if (!clienteName && relationCol.value) {
            try {
              const relationValue = JSON.parse(relationCol.value);
              if (relationValue.linked_item_ids && relationValue.linked_item_ids.length > 0) {
                const firstLinkedId = relationValue.linked_item_ids[0];
                clienteName = linkedItemsMap.get(firstLinkedId) || null;
              }
            } catch (e) {
              // Ignora errori di parsing
            }
          }
        }
      }
      
      // Importo annuale da "importo" (in centesimi)
      let importoAnnualCents = null;
      if (importoColId) {
        const importoText = cols[importoColId]?.text || cols[importoColId]?.value;
        if (importoText) {
          const num = Number(String(importoText).replace(/[^0-9.-]/g, ''));
          if (!Number.isNaN(num)) {
            importoAnnualCents = Math.round(num * 100);
          }
        }
      }
      
      // Mese rinnovo
      const meseRinnovo = meseScadenzaColId ? (cols[meseScadenzaColId]?.text || cols[meseScadenzaColId]?.value) : null;
      
      // Anni attivi (array)
      const anni: number[] = [];
      if (col2024Id && cols[col2024Id]?.value) {
        try {
          const checked = JSON.parse(cols[col2024Id].value || '{}').checked;
          if (checked) anni.push(2024);
        } catch (e) {}
      }
      if (col2025Id && cols[col2025Id]?.value) {
        try {
          const checked = JSON.parse(cols[col2025Id].value || '{}').checked;
          if (checked) anni.push(2025);
        } catch (e) {}
      }
      
      // Piano: leggi dalla colonna, fallback a "Enterprise" se non trovato
      let piano = 'Enterprise'; // default
      if (pianoColId) {
        const pianoText = cols[pianoColId]?.text || cols[pianoColId]?.value;
        if (pianoText) {
          piano = String(pianoText).trim();
        }
      }
      
      // Interventi ammissibili (da colonna stato_1)
      const interventiAmmissibili = stato1ColId ? (cols[stato1ColId]?.text === 'Ammissibili') : null;
      
      // Output solo con i campi richiesti (in inglese)
      return {
        customerName: clienteName,
        annualAmountCents: importoAnnualCents,
        years: anni,
        renewalMonth: meseRinnovo,
        plan: piano,
        interventionsEligible: interventiAmmissibili,
      };
    }
    
    // Per record non-AVACY, non includerli nell'output
    return null;
  });

  // Filtra solo record AVACY (rimuovi null)
  const avacyRecords = records.filter((r) => r !== null);
  
  // Mappa nomi mesi italiani a numeri
  const monthMap: Record<string, number> = {
    'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
    'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12,
  };

  // Genera new-subscriptions.json (stesso formato di Stripe)
  const subscriptionsByDate: Record<string, {
    date: string;
    count: number;
    totalAmountCents: number;
    currency: string;
    purchases: Array<{
      email?: string;
      subscriptionName?: string;
      amountCents?: number;
      currency?: string;
      metadata?: Record<string, string>;
    }>;
  }> = {};

  // Genera cancellations.json (stesso formato di Stripe)
  const cancellationsByDate: Record<string, {
    date: string;
    count: number;
    totalAmountCents: number;
    currency: string;
    cancellations: Array<{
      email?: string;
      subscriptionName?: string;
      amountCents?: number;
      canceledAt?: string;
      currency?: string;
      metadata?: Record<string, string>;
    }>;
  }> = {};

  for (const account of avacyRecords) {
    if (!account.annualAmountCents || !account.renewalMonth || account.years.length === 0) continue;

    const monthName = account.renewalMonth.toLowerCase();
    const monthNum = monthMap[monthName];
    if (!monthNum) continue;

    const monthlyMrrCents = Math.round(account.annualAmountCents / 12);
    const yearsSet = new Set(account.years);
    const sortedYears = account.years.slice().sort((a, b) => a - b);

    // Crea subscriptions per ogni anno attivo
    for (const year of sortedYears) {
      const dateKey = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      
      if (!subscriptionsByDate[dateKey]) {
        subscriptionsByDate[dateKey] = {
          date: dateKey,
          count: 0,
          totalAmountCents: 0,
          currency: 'EUR',
          purchases: [],
        };
      }

      subscriptionsByDate[dateKey].count += 1;
      subscriptionsByDate[dateKey].totalAmountCents += monthlyMrrCents;
      subscriptionsByDate[dateKey].purchases.push({
        email: account.customerName || undefined,
        subscriptionName: account.plan,
        amountCents: monthlyMrrCents,
        currency: 'EUR',
        metadata: {
          source: 'monday',
          interventionsEligible: account.interventionsEligible?.toString() || '',
        },
      });
    }

    // Crea cancellations quando passa da attivo a non attivo
    // Solo per anni già passati o al massimo l'anno corrente
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    
    for (let i = 0; i < sortedYears.length; i++) {
      const activeYear = sortedYears[i];
      const nextYear = activeYear + 1;
      
      // Genera cancellazione solo se:
      // 1. L'account era attivo in activeYear ma non in nextYear
      // 2. nextYear è già passato o è l'anno corrente E il mese di rinnovo è già passato
      if (yearsSet.has(activeYear) && !yearsSet.has(nextYear)) {
        // Controlla se nextYear è già passato o se siamo nell'anno corrente e il mese di rinnovo è passato
        const isNextYearPast = nextYear < currentYear;
        const isNextYearCurrent = nextYear === currentYear && monthNum < currentMonth;
        
        if (isNextYearPast || isNextYearCurrent) {
          const cancelDateKey = `${nextYear}-${String(monthNum).padStart(2, '0')}-01`;
          
          if (!cancellationsByDate[cancelDateKey]) {
            cancellationsByDate[cancelDateKey] = {
              date: cancelDateKey,
              count: 0,
              totalAmountCents: 0,
              currency: 'EUR',
              cancellations: [],
            };
          }

          cancellationsByDate[cancelDateKey].count += 1;
          cancellationsByDate[cancelDateKey].totalAmountCents += monthlyMrrCents;
          cancellationsByDate[cancelDateKey].cancellations.push({
            email: account.customerName || undefined,
            subscriptionName: account.plan,
            amountCents: monthlyMrrCents,
            currency: 'EUR',
            canceledAt: cancelDateKey + 'T00:00:00.000Z',
            metadata: {
              source: 'monday',
              interventionsEligible: account.interventionsEligible?.toString() || '',
            },
          });
        }
      }
    }
  }

  // Converti in array e ordina per data
  const newSubscriptions = Object.values(subscriptionsByDate).sort((a, b) => a.date.localeCompare(b.date));
  const cancellations = Object.values(cancellationsByDate).sort((a, b) => a.date.localeCompare(b.date));

  // Salva i file JSON
  const outDir = join(process.cwd(), 'src', 'data', 'avacy', 'json', 'monday');
  mkdirSync(outDir, { recursive: true });
  
  writeFileSync(join(outDir, 'new-subscriptions.json'), JSON.stringify(newSubscriptions, null, 2), 'utf8');
  writeFileSync(join(outDir, 'cancellations.json'), JSON.stringify(cancellations, null, 2), 'utf8');

  console.log(`Saved ${newSubscriptions.length} new subscriptions to src/data/avacy/json/monday/new-subscriptions.json`);
  console.log(`Saved ${cancellations.length} cancellations to src/data/avacy/json/monday/cancellations.json`);
  
  // Mostra alcuni esempi
  if (newSubscriptions.length > 0) {
    console.log(`\n=== ESEMPI NEW SUBSCRIPTIONS (${newSubscriptions.length} totali) ===`);
    newSubscriptions.slice(0, 3).forEach((item) => {
      console.log(`  - ${item.date}: ${item.count} subscription(s), ${(item.totalAmountCents / 100).toFixed(2)}€`);
      if (item.purchases.length > 0) {
        console.log(`    Customer: ${item.purchases[0].email || 'N/A'}, Plan: ${item.purchases[0].subscriptionName}`);
      }
    });
  }
  
  if (cancellations.length > 0) {
    console.log(`\n=== ESEMPI CANCELLATIONS (${cancellations.length} totali) ===`);
    cancellations.slice(0, 3).forEach((item) => {
      console.log(`  - ${item.date}: ${item.count} cancellation(s), ${(item.totalAmountCents / 100).toFixed(2)}€`);
      if (item.cancellations.length > 0) {
        console.log(`    Customer: ${item.cancellations[0].email || 'N/A'}, Plan: ${item.cancellations[0].subscriptionName}`);
      }
    });
  }
}

export default fetchEnterpriseAccounts;


