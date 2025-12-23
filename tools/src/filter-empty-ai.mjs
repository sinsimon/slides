import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const csvFile = process.argv[2] || 'tools/output/emails_export_2024-01-01_2025-12-22.csv';
const outputFile = csvFile.replace('.csv', '_ai_vuote.csv');

console.log(`📖 Leggendo: ${csvFile}`);

const csvContent = readFileSync(csvFile, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  bom: true
});

console.log(`📊 Email totali: ${records.length}`);

// Filtra email con colonne AI vuote (riassunto vuoto O risolto vuoto/null)
const emailConAiVuote = records.filter(row => {
  const riassuntoVuoto = !row.riassunto || row.riassunto.trim() === '';
  const risoltoVuoto = row.risolto === '' || row.risolto === null || row.risolto === undefined || row.risolto === 'false';
  return riassuntoVuoto || risoltoVuoto;
});

console.log(`🔍 Email con colonne AI vuote: ${emailConAiVuote.length}`);

// Svuota esplicitamente le colonne AI per chiarezza
const emailConAiSvuotate = emailConAiVuote.map(row => ({
  ...row,
  riassunto: '',
  risolto: ''
}));

const outputCsv = stringify(emailConAiSvuotate, {
  header: true,
  columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'data', 'categoria', 'riassunto', 'risolto', 'body']
});

writeFileSync(outputFile, outputCsv, 'utf-8');

console.log(`✅ CSV creato: ${outputFile}`);
console.log(`\n📋 Colonne AI vuote:`);
console.log(`   - riassunto: vuoto`);
console.log(`   - risolto: vuoto`);
console.log(`\n💡 Quando avrai quota disponibile, usa:`);
console.log(`   npm run tools:emails:analyze -- --query "to:support@avacysolution.com" --from 2024-01-01 --ai --re-evaluate`);
