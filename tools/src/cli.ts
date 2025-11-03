#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildConfig } from './config.js';
import { fetchEvents } from './google.js';
import { labelEvents } from './categorize.js';
import { rowsToCsv } from './csv.js';
import { parseIcs } from './ics.js';

function parseArgs(argv: string[]) {
  const args = { from: undefined as string|undefined, calendarId: undefined as string|undefined, categories: undefined as string|undefined, ai: false, out: undefined as string|undefined, ics: undefined as string|undefined, examples: undefined as string|undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i+1]) args.from = argv[++i];
    else if (a === '--calendar-id' && argv[i+1]) args.calendarId = argv[++i];
    else if (a === '--categories' && argv[i+1]) args.categories = argv[++i];
    else if (a === '--ai') args.ai = true;
    else if (a === '--out' && argv[i+1]) args.out = argv[++i];
    else if (a === '--ics' && argv[i+1]) args.ics = argv[++i];
    else if (a === '--examples' && argv[i+1]) args.examples = argv[++i];
  }
  return args;
}

function toYMD(iso: string): string { return iso.slice(0,10); }

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cfg = buildConfig({
    fromArg: args.from,
    calendarIdArg: args.calendarId,
    categoriesFileArg: args.categories,
    examplesFileArg: args.examples,
    useAIArg: args.ai
  });

  const timeMinISO = new Date(cfg.startDateISO + 'T00:00:00.000Z').toISOString();

  const events = args.ics
    ? parseIcs(path.resolve(process.cwd(), args.ics), { timeMinISO })
    : await fetchEvents({ calendarId: cfg.calendarId, timeMinISO });

  const simplified = events
    .map(e => ({
      title: e.summary,
      dateISO: e.start,
      hours: Number(e.durationHours.toFixed(2))
    }))
    .filter(e => e.hours > 0);

  const labeled = await labelEvents(simplified, cfg.categories, { useAI: cfg.useAI, geminiApiKey: cfg.geminiApiKey, geminiModel: cfg.geminiModel, aiBatchSize: cfg.aiBatchSize, examples: cfg.examples });
  const rows = labeled.map(l => ({
    titolo: l.title,
    data: toYMD(l.dateISO),
    ore: l.hours,
    categoria: l.category
  }));

  const csv = rowsToCsv(rows);
  const outPath = args.out || (() => {
    const dir = path.resolve(process.cwd(), 'tools/output');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0,10);
    const base = `calendar_export_${cfg.startDateISO}_${today}.csv`;
    return path.join(dir, base);
  })();

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`CSV scritto: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
