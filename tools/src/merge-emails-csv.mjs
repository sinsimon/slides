import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const csv2024 = 'tools/output/emails_export_2024-01-01_2025-12-22.csv';
const csv2025 = 'tools/output/emails_export_2025-01-01_2025-12-22.csv';
const outputFile = 'tools/output/emails_export_COMPLETO_2024-2025.csv';

console.log('📖 Leggendo CSV 2024...');
const csv2024Content = readFileSync(csv2024, 'utf-8');
const records2024 = parse(csv2024Content, {
  columns: true,
  skip_empty_lines: true,
  bom: true
});

console.log(`   ✅ ${records2024.length} email dal 2024`);

console.log('📖 Leggendo CSV 2025...');
const csv2025Content = readFileSync(csv2025, 'utf-8');
const records2025 = parse(csv2025Content, {
  columns: true,
  skip_empty_lines: true,
  bom: true
});

console.log(`   ✅ ${records2025.length} email dal 2025`);

// Normalizza i record del 2025 per avere le stesse colonne del 2024
const records2025Normalized = records2025.map(row => ({
  numeroMail: row.numeroMail || '',
  threadId: row.threadId || '',
  subject: row.subject || '',
  from: row.from || '',
  cliente: row.cliente || extractEmailFromFrom(row.from) || '',
  data: row.data || '',
  categoria: row.categoria || '',
  riassunto: row.riassunto || '',
  risolto: row.risolto || '',
  body: row.body || '' // Il CSV 2025 non ha body, quindi sarà vuoto
}));

// Unifica tutti i record
const allRecords = [...records2024, ...records2025Normalized];

console.log(`\n📊 Totale email: ${allRecords.length}`);
console.log(`   - Con body: ${allRecords.filter(r => r.body && r.body.trim()).length}`);
console.log(`   - Senza body: ${allRecords.filter(r => !r.body || !r.body.trim()).length}`);

// Ordina per data (più recenti prima)
allRecords.sort((a, b) => {
  const dateA = new Date(a.data || '1900-01-01');
  const dateB = new Date(b.data || '1900-01-01');
  return dateB - dateA;
});

const outputCsv = stringify(allRecords, {
  header: true,
  columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'data', 'categoria', 'riassunto', 'risolto', 'body']
});

writeFileSync(outputFile, outputCsv, 'utf-8');

console.log(`\n✅ CSV unificato creato: ${outputFile}`);
console.log(`\n📋 Colonne incluse:`);
console.log(`   - numeroMail, threadId, subject, from, cliente, data`);
console.log(`   - categoria, riassunto, risolto, body`);

function extractEmailFromFrom(from) {
  if (!from) return '';
  from = from.trim().replace(/^[\"']|[\"']$/g, '');
  const match1 = from.match(/<(.+?)>$/);
  if (match1) return match1[1].trim();
  const emailMatch = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) return emailMatch[1];
  return '';
}
