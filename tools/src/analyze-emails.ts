import fs from 'node:fs';
import path from 'node:path';
import { buildConfig, loadCategories } from './config.js';
import { labelEmails, generateSummary, determineIfResolved } from './categorize-emails.js';
import { emailsToCsv, type EmailCsvRow } from './csv-emails.js';
import { fetchEmails, fetchThread, saveEmailsCache, loadEmailsCache } from './gmail.js';

const PROCESSING_CHECKPOINT_DIR = path.resolve(process.cwd(), 'tools/.cache');
const PROCESSING_CHECKPOINT_FILE = path.join(PROCESSING_CHECKPOINT_DIR, 'processing-checkpoint.json');

type ProcessingCheckpoint = {
  query: string;
  timeMinISO?: string;
  timeMaxISO?: string;
  processedEmails: Record<string, EmailCsvRow>; // emailId -> risultato processato
  lastUpdated: string;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadCheckpoint(query: string, timeMinISO?: string, timeMaxISO?: string): ProcessingCheckpoint | null {
  try {
    if (!fs.existsSync(PROCESSING_CHECKPOINT_FILE)) return null;
    const data = fs.readFileSync(PROCESSING_CHECKPOINT_FILE, 'utf8');
    const checkpoint: ProcessingCheckpoint = JSON.parse(data);
    
    // Verifica che corrisponda alla query corrente
    if (checkpoint.query !== query) return null;
    if (checkpoint.timeMinISO !== timeMinISO) return null;
    if (checkpoint.timeMaxISO !== timeMaxISO) return null;
    
    return checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(checkpoint: ProcessingCheckpoint): void {
  ensureDir(PROCESSING_CHECKPOINT_DIR);
  checkpoint.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROCESSING_CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

function createCheckpoint(query: string, timeMinISO?: string, timeMaxISO?: string): ProcessingCheckpoint {
  return {
    query,
    timeMinISO,
    timeMaxISO,
    processedEmails: {},
    lastUpdated: new Date().toISOString()
  };
}

function extractClienteEmail(from: string): string {
  // Estrae l'email dal campo "from"
  // Formato tipico: "Nome Cognome <email@domain.com>" oppure "email@domain.com"
  
  // Rimuovi eventuali virgolette
  from = from.trim().replace(/^["']|["']$/g, '');
  
  // Cerca pattern "Nome <email>"
  const match1 = from.match(/<(.+?)>$/);
  if (match1) {
    return match1[1].trim();
  }
  
  // Cerca pattern email diretto
  const emailMatch = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    return emailMatch[1];
  }
  
  // Fallback: ritorna tutto
  return from;
}

function parseArgs(argv: string[]) {
  const args = {
    from: undefined as string | undefined,
    to: undefined as string | undefined,
    query: undefined as string | undefined,
    categories: undefined as string | undefined,
    ai: false,
    out: undefined as string | undefined,
    maxResults: 500,
    forceRefresh: false,
    reEvaluate: false, // Forza rivalutazione di categoria, riassunto e risolto
    limit: undefined as number | undefined // Limita il numero di email da processare
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) args.from = argv[++i];
    else if (a === '--to' && argv[i + 1]) args.to = argv[++i];
    else if (a === '--query' && argv[i + 1]) args.query = argv[++i];
    else if (a === '--categories' && argv[i + 1]) args.categories = argv[++i];
    else if (a === '--ai') args.ai = true;
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--max-results' && argv[i + 1]) args.maxResults = parseInt(argv[++i], 10);
    else if (a === '--force-refresh') args.forceRefresh = true;
    else if (a === '--re-evaluate') args.reEvaluate = true;
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  // Default a 2024-01-01 se non specificato
  const defaultFrom = '2024-01-01';
  const cfg = buildConfig({
    fromArg: args.from || defaultFrom,
    categoriesFileArg: args.categories || 'tools/categories-emails.sample.json',
    useAIArg: args.ai
  });

  const timeMinISO = args.from
    ? new Date(args.from + 'T00:00:00.000Z').toISOString()
    : new Date(defaultFrom + 'T00:00:00.000Z').toISOString();
  const timeMaxISO = args.to
    ? new Date(args.to + 'T23:59:59.999Z').toISOString()
    : undefined;

  // Query di default: cerca email inviate a un indirizzo di support
  const query = args.query || process.env.GMAIL_SUPPORT_QUERY || 'to:support@avacysolution.com';

  console.log(`Cercando email con query: "${query}"`);
  console.log(`Periodo: ${timeMinISO.slice(0, 10)} ${timeMaxISO ? `- ${timeMaxISO.slice(0, 10)}` : '(fino a oggi)'}`);

  // Carica dalla cache se disponibile
  let emails = args.forceRefresh ? null : loadEmailsCache(query, timeMinISO, timeMaxISO);

  if (!emails) {
    console.log('Scaricando email da Gmail...');
    emails = await fetchEmails({
      query,
      maxResults: args.maxResults,
      timeMinISO,
      timeMaxISO
    });
    console.log(`Trovate ${emails.length} email`);
    
    // Verifica che il body sia stato estratto correttamente
    const emailsWithBody = emails.filter(e => e.body && e.body.length > 50).length;
    const emailsWithOnlySnippet = emails.filter(e => (!e.body || e.body.length <= 50) && e.snippet).length;
    console.log(`  - ${emailsWithBody} email con body completo`);
    console.log(`  - ${emailsWithOnlySnippet} email con solo snippet`);
    
    // Salva in cache
    saveEmailsCache(emails, query, timeMinISO, timeMaxISO);
    console.log('Email salvate in cache per riutilizzo futuro');
  } else {
    // Verifica anche per email in cache
    const emailsWithBody = emails.filter(e => e.body && e.body.length > 50).length;
    const emailsWithOnlySnippet = emails.filter(e => (!e.body || e.body.length <= 50) && e.snippet).length;
    console.log(`Email caricate dalla cache:`);
    console.log(`  - ${emailsWithBody} email con body completo`);
    console.log(`  - ${emailsWithOnlySnippet} email con solo snippet`);
    console.log(`(Usa --force-refresh per scaricare di nuovo con estrazione body migliorata)`);
  }

  if (emails.length === 0) {
    console.log('Nessuna email trovata. Verifica la query o il periodo.');
    return;
  }

  // Applica limite se specificato
  if (args.limit && args.limit > 0) {
    emails = emails.slice(0, args.limit);
    console.log(`\n⚠️  Limite applicato: processando solo le prime ${args.limit} email`);
  }

  // Carica checkpoint se esiste (a meno che non si forzi il refresh)
  let checkpoint = args.forceRefresh ? null : loadCheckpoint(query, timeMinISO, timeMaxISO);
  const processedCount = checkpoint ? Object.keys(checkpoint.processedEmails).length : 0;
  
  if (checkpoint && processedCount > 0) {
    console.log(`\nTrovato checkpoint: ${processedCount} email già processate. Riprendendo da dove si era interrotto...`);
    console.log(`(Usa --force-refresh per ricominciare da zero)`);
  } else {
    checkpoint = createCheckpoint(query, timeMinISO, timeMaxISO);
  }

  // Categorizzazione (solo per email non ancora categorizzate, o tutte se --re-evaluate)
  const categories = loadCategories(cfg.categoriesFile);
  const emailsToCategorize = emails.filter(e => {
    if (args.reEvaluate) return true; // Forza rivalutazione
    const existing = checkpoint.processedEmails[e.id];
    return !existing || !existing.categoria || existing.categoria === 'non categorizzato';
  });
  
  if (emailsToCategorize.length > 0) {
    console.log(`\nCategorizzando ${emailsToCategorize.length} email (${processedCount} già processate)...`);
    
    const labeled = await labelEmails(
      emailsToCategorize.map(e => ({
        subject: e.subject,
        body: e.body || e.snippet || '', // Assicurati che body non sia undefined
        from: e.from,
        dateISO: e.date
      })),
      categories,
      {
        useAI: cfg.useAI,
        geminiApiKey: cfg.geminiApiKey,
        geminiModel: cfg.geminiModel,
        aiBatchSize: cfg.aiBatchSize
      }
    );
    
    // Salva le categorie nel checkpoint
    for (let i = 0; i < emailsToCategorize.length; i++) {
      const email = emailsToCategorize[i];
      const labeledEmail = labeled[i];
      const existing = checkpoint.processedEmails[email.id];
      
      if (existing) {
        existing.categoria = labeledEmail.category;
        if (!existing.body) {
          existing.body = email.body || email.snippet || '';
        }
      } else {
        checkpoint.processedEmails[email.id] = {
          numeroMail: email.id,
          threadId: email.threadId,
          subject: email.subject,
          from: email.from,
          cliente: extractClienteEmail(email.from),
          data: email.date.slice(0, 10),
          categoria: labeledEmail.category,
          riassunto: '', // Da generare dopo
          risolto: false, // Da determinare dopo
          body: email.body || email.snippet || ''
        };
      }
    }
    saveCheckpoint(checkpoint);
  }
  
  // Crea mappa categoria per tutte le email
  const categoryMap = new Map<string, string>();
  emails.forEach(e => {
    const existing = checkpoint.processedEmails[e.id];
    categoryMap.set(e.id, existing?.categoria || 'non categorizzato');
  });

  // Genera riassunti e determina se risolto (solo per email non ancora processate completamente)
  console.log('\nGenerando riassunti e determinando stato risoluzione...');
  const uniqueThreadIds = Array.from(new Set(emails.map(e => e.threadId))).filter(Boolean);
  const threadCache = new Map<string, any[]>();
  
  // Pre-carica i thread (in batch per performance) - solo se necessario
  const emailsNeedingProcessing = emails.filter(e => {
    if (args.reEvaluate) return true; // Forza rivalutazione
    const processed = checkpoint.processedEmails[e.id];
    return !processed || !processed.riassunto || processed.riassunto === '';
  });
  
  if (emailsNeedingProcessing.length > 0 && cfg.useAI && cfg.geminiApiKey) {
    const neededThreadIds = Array.from(new Set(emailsNeedingProcessing.map(e => e.threadId))).filter(Boolean);
    console.log(`Recuperando ${neededThreadIds.length} thread per analisi...`);
    for (let i = 0; i < neededThreadIds.length; i++) {
      const threadId = neededThreadIds[i];
      if (i % 10 === 0) console.log(`  Thread ${i + 1}/${neededThreadIds.length}...`);
      try {
        const threadMessages = await fetchThread(threadId);
        threadCache.set(threadId, threadMessages);
      } catch (err) {
        console.error(`Errore recupero thread ${threadId}:`, err);
      }
    }
  }

  // Processa ogni email (solo quelle non ancora completate)
  const processedRows: EmailCsvRow[] = [];
  let processedInThisRun = 0;
  
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const existing = checkpoint.processedEmails[email.id];
    
    // Se già completamente processata e non si forza la rivalutazione, usa i dati esistenti
    if (!args.reEvaluate && existing && existing.riassunto && existing.riassunto !== '') {
      // Assicurati che il body sia presente
      if (!existing.body) {
        existing.body = email.body || email.snippet || '';
      }
      processedRows.push(existing);
      continue;
    }
    
    // Altrimenti processa
    const categoria = categoryMap.get(email.id) || 'non categorizzato';
    
    // Genera riassunto (se non presente o se si forza la rivalutazione)
    let riassunto = (args.reEvaluate ? '' : existing?.riassunto) || '';
    if ((!riassunto || args.reEvaluate) && cfg.useAI && cfg.geminiApiKey) {
      try {
        riassunto = await generateSummary(
          email.subject,
          email.body || email.snippet || '',
          cfg.geminiApiKey,
          cfg.geminiModel
        ) || '';
        // Delay tra richieste per evitare rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Errore generazione riassunto per ${email.id}:`, err);
      }
    }
    
    // Determina se risolto (se non presente o se si forza la rivalutazione)
    let risolto = args.reEvaluate ? false : (existing?.risolto || false);
    if ((args.reEvaluate || !existing?.risolto) && email.threadId && threadCache.has(email.threadId)) {
      const threadMessages = threadCache.get(email.threadId)!;
      try {
        if (cfg.useAI && cfg.geminiApiKey) {
          risolto = await determineIfResolved(
            threadMessages,
            cfg.geminiApiKey,
            cfg.geminiModel
          );
        } else {
          // Fallback semplice: se ultimo messaggio è dal support e sono passati 7+ giorni
          const lastMsg = threadMessages[threadMessages.length - 1];
          if (lastMsg.isFromSupport) {
            const daysSinceLastMsg = (Date.now() - new Date(lastMsg.date).getTime()) / (1000 * 60 * 60 * 24);
            risolto = daysSinceLastMsg > 7;
          }
        }
      } catch (err) {
        console.error(`Errore determinazione risolto per ${email.id}:`, err);
      }
    }
    
    const cliente = extractClienteEmail(email.from);
    
    const row: EmailCsvRow = {
      numeroMail: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      cliente: cliente,
      data: email.date.slice(0, 10),
      categoria: categoria,
      riassunto: riassunto || '',
      risolto: risolto,
      body: email.body || email.snippet || ''
    };
    
    processedRows.push(row);
    
    // Salva nel checkpoint
    checkpoint.processedEmails[email.id] = row;
    processedInThisRun++;
    
    // Salva checkpoint ogni 10 email processate
    if (processedInThisRun % 10 === 0) {
      saveCheckpoint(checkpoint);
      console.log(`  Processate ${processedInThisRun} nuove email (totale: ${processedRows.length}/${emails.length})...`);
    }
  }
  
  // Salva checkpoint finale
  saveCheckpoint(checkpoint);

  // Genera CSV
  const csv = emailsToCsv(processedRows);
  const outPath = args.out || (() => {
    const dir = path.resolve(process.cwd(), 'tools/output');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const base = `emails_export_${timeMinISO.slice(0, 10)}_${today}.csv`;
    return path.join(dir, base);
  })();

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`\nCSV scritto: ${outPath}`);
  
  // Statistiche
  console.log(`\nRiepilogo categorie:`);
  const byCategory = new Map<string, number>();
  processedRows.forEach(r => {
    byCategory.set(r.categoria, (byCategory.get(r.categoria) || 0) + 1);
  });
  Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  
  const risolte = processedRows.filter(r => r.risolto).length;
  console.log(`\nRisolte: ${risolte}/${processedRows.length} (${Math.round(risolte / processedRows.length * 100)}%)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
