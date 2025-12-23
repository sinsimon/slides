import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const checkpointPath = 'tools/.cache/threads-checkpoint.json';
const csvPath = 'tools/output/emails_export_PER_THREAD_AI.csv';

console.log('📖 Leggendo checkpoint:', checkpointPath);
const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
console.log('  Voci checkpoint:', Object.keys(checkpoint).length);

console.log('📖 Leggendo CSV:', csvPath);
const csvContent = readFileSync(csvPath, 'utf-8');
const rows = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  bom: true
});

let updated = 0;

for (const row of rows) {
  const threadId = row.threadId || row.numeroMail;
  if (!threadId) continue;
  const ck = checkpoint[threadId];
  if (!ck) continue;

  const missingCategoria = !row.categoria || !row.categoria.trim();
  const missingRiassunto = !row.riassunto || !row.riassunto.trim();
  const missingRisolto = !row.risolto || !String(row.risolto).trim();

  if (missingCategoria || missingRiassunto || missingRisolto) {
    row.categoria = ck.categoria ?? row.categoria ?? '';
    row.riassunto = ck.riassunto ?? row.riassunto ?? '';
    row.risolto = ck.risolto ?? row.risolto ?? '';
    updated++;
  }
}

console.log('✅ Righe aggiornate da checkpoint:', updated);

const outCsv = stringify(rows, {
  header: true,
  columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'to', 'data', 'categoria', 'riassunto', 'risolto', 'body']
});

writeFileSync(csvPath, outCsv, 'utf-8');
console.log('💾 CSV sovrascritto con valori AI ripristinati.');
