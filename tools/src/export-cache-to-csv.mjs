import { readFileSync, writeFileSync } from 'fs';
import { stringify } from 'csv-stringify/sync';

const cacheFile = 'tools/.cache/emails-cache.json';
const outputFile = 'tools/output/emails_export_COMPLETO_CON_BODY.csv';

console.log(`📖 Leggendo cache: ${cacheFile}`);

const cacheData = JSON.parse(readFileSync(cacheFile, 'utf-8'));
const emails = cacheData.emails || [];

console.log(`📊 Email trovate in cache: ${emails.length}`);
console.log(`   - Con body completo: ${emails.filter(e => e.body && e.body.length > 50).length}`);
console.log(`   - Con solo snippet: ${emails.filter(e => (!e.body || e.body.length <= 50) && e.snippet).length}`);

// Estrai email dal campo "from"
function extractClienteEmail(from) {
  if (!from) return '';
  from = from.trim().replace(/^[\"']|[\"']$/g, '');
  const match1 = from.match(/<(.+?)>$/);
  if (match1) return match1[1].trim();
  const emailMatch = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) return emailMatch[1];
  return from;
}

// Converti in formato CSV
const csvRows = emails.map(email => {
  const date = email.dateISO ? email.dateISO.slice(0, 10) : '';
  return {
    numeroMail: email.id || '',
    threadId: email.threadId || '',
    subject: email.subject || '',
    from: email.from || '',
    cliente: extractClienteEmail(email.from),
    data: date,
    categoria: '', // Vuoto, da popolare con AI
    riassunto: '', // Vuoto, da popolare con AI
    risolto: '', // Vuoto, da popolare con AI
    body: email.body || email.snippet || ''
  };
});

// Ordina per data (più recenti prima)
csvRows.sort((a, b) => {
  const dateA = new Date(a.data || '1900-01-01');
  const dateB = new Date(b.data || '1900-01-01');
  return dateB - dateA;
});

const outputCsv = stringify(csvRows, {
  header: true,
  columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'data', 'categoria', 'riassunto', 'risolto', 'body']
});

writeFileSync(outputFile, outputCsv, 'utf-8');

console.log(`\n✅ CSV creato: ${outputFile}`);
console.log(`\n📋 Colonne incluse:`);
console.log(`   - numeroMail, threadId, subject, from, cliente, data`);
console.log(`   - categoria, riassunto, risolto, body`);
console.log(`\n💡 Questo CSV contiene TUTTE le email con i body completi dalla cache.`);
