import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Leggi direttamente dalla cache JSON per avere tutti i campi (incluso "to")
const cacheFile = 'tools/.cache/emails-cache.json';
const outputFile = 'tools/output/emails_export_PER_THREAD.csv';

console.log(`📖 Leggendo cache: ${cacheFile}`);

const cacheData = JSON.parse(readFileSync(cacheFile, 'utf-8'));
const emailsFromCache = cacheData.emails || [];

// Converti in formato simile al CSV per compatibilità
const records = emailsFromCache.map(e => ({
  numeroMail: e.id || '',
  threadId: e.threadId || e.id || '',
  subject: e.subject || '',
  from: e.from || '',
  to: e.to || '',
  data: e.dateISO ? e.dateISO.slice(0, 10) : '',
  categoria: '',
  riassunto: '',
  risolto: '',
  body: e.body || e.snippet || ''
}));

console.log(`📊 Email totali: ${records.length}`);

// Raggruppa per threadId
const threads = new Map();

for (const record of records) {
  const threadId = record.threadId || record.numeroMail; // Fallback a numeroMail se threadId mancante
  const from = record.from || '';
  const fromEmail = extractEmailFromFrom(from);

  if (!threads.has(threadId)) {
    threads.set(threadId, {
      threadId,
      emails: []
    });
  }

  threads.get(threadId).emails.push({
    ...record,
    fromEmail
  });
}

console.log(`🔗 Thread trovati: ${threads.size}`);

// Processa ogni thread
const threadRows = [];

for (const [threadId, thread] of threads) {
  const emails = thread.emails;

  // Ordina email per data (più vecchia prima)
  emails.sort((a, b) => {
    const dateA = new Date(a.data || '1900-01-01');
    const dateB = new Date(b.data || '1900-01-01');
    return dateA - dateB;
  });

  // Identifica cliente (from che NON contiene jumpgroup/avacy/noreply)
  const clientEmails = emails.filter(e => {
    const email = e.fromEmail.toLowerCase();
    return !email.includes('jumpgroup') &&
      !email.includes('avacy') &&
      !email.includes('noreply') &&
      email.includes('@');
  });

  // Se non trovi cliente, prova a cercare nel "to" delle email di support
  let cliente = '';
  let clienteFrom = '';

  if (clientEmails.length > 0) {
    cliente = clientEmails[0].fromEmail;
    clienteFrom = clientEmails[0].from;
  } else {
    // Cerca nel "to" delle email di support (il cliente è nel destinatario)
    for (const e of emails) {
      const toField = e.to || '';
      const toEmails = toField.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];
      for (const toEmail of toEmails) {
        const toEmailLower = toEmail.toLowerCase();
        if (!toEmailLower.includes('jumpgroup') &&
          !toEmailLower.includes('avacy') &&
          !toEmailLower.includes('support@avacysolution.com') &&
          !toEmailLower.includes('noreply')) {
          cliente = toEmail;
          clienteFrom = toEmail; // Usa email come fallback se non c'è nome
          break;
        }
      }
      if (cliente) break;
    }
  }

  // Identifica chi ha risposto (from che contiene jumpgroup/avacy)
  const supportEmails = emails.filter(e => {
    const email = e.fromEmail.toLowerCase();
    return (email.includes('jumpgroup') ||
      email.includes('avacy') ||
      email.includes('support@avacysolution.com')) &&
      email.includes('@');
  });

  const to = supportEmails.length > 0 ? supportEmails[0].fromEmail : '';

  // Subject originale (rimuovi "Re:", "Fwd:", etc.)
  const originalSubject = emails[0].subject
    .replace(/^(Re:|Fwd:|Fw:)\s*/i, '')
    .trim();

  // Data: prima email del thread
  const data = emails[0].data || '';

  // Accorpa tutti i body del thread
  const bodies = emails.map(e => {
    const emailBody = e.body || '';
    const emailFrom = e.from || '';
    const emailDate = e.data ? new Date(e.data).toLocaleString('it-IT') : '';
    return `--- Email da ${emailFrom} (${emailDate}) ---\n${emailBody}`;
  });
  const bodyAccorpato = bodies.join('\n\n');

  threadRows.push({
    numeroMail: threadId, // Usa threadId come identificatore
    threadId: threadId,
    subject: originalSubject,
    from: clienteFrom || cliente, // Nome completo del cliente
    cliente: cliente, // Solo email del cliente
    to: to, // Email di chi ha risposto (support)
    data: data,
    categoria: '', // AI vuoto
    riassunto: '', // AI vuoto
    risolto: '', // AI vuoto
    body: bodyAccorpato
  });
}

// Ordina per data (più recenti prima)
threadRows.sort((a, b) => {
  const dateA = new Date(a.data || '1900-01-01');
  const dateB = new Date(b.data || '1900-01-01');
  return dateB - dateA;
});

const outputCsv = stringify(threadRows, {
  header: true,
  columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'to', 'data', 'categoria', 'riassunto', 'risolto', 'body']
});

writeFileSync(outputFile, outputCsv, 'utf-8');

console.log(`\n✅ CSV creato: ${outputFile}`);
console.log(`📊 Thread processati: ${threadRows.length}`);
console.log(`\n📋 Colonne:`);
console.log(`   - from: nome completo del cliente`);
console.log(`   - cliente: email del cliente`);
console.log(`   - to: email di chi ha risposto (support/jumpgroup/avacy), vuoto se nessuno ha risposto`);
console.log(`   - body: tutti i messaggi del thread accorpati`);
console.log(`   - categoria, riassunto, risolto: vuoti (da popolare con AI)`);

function extractEmailFromFrom(from) {
  if (!from) return '';
  from = from.trim().replace(/^[\"']|[\"']$/g, '');
  const match1 = from.match(/<(.+?)>$/);
  if (match1) return match1[1].trim().toLowerCase();
  const emailMatch = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) return emailMatch[1].toLowerCase();
  return '';
}
