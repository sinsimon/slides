import fs from 'node:fs';
import path from 'node:path';
import ical from 'node-ical';
import { buildConfig, loadCategories } from './config.js';
import { labelEvents } from './categorize.js';

function parseArgs(argv: string[]) {
  const args = { from: undefined as string|undefined, ics: undefined as string|undefined, categories: undefined as string|undefined, ai: false, limit: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i+1]) args.from = argv[++i];
    else if (a === '--ics' && argv[i+1]) args.ics = argv[++i];
    else if (a === '--categories' && argv[i+1]) args.categories = argv[++i];
    else if (a === '--ai') args.ai = true;
    else if (a === '--limit' && argv[i+1]) args.limit = parseInt(argv[++i], 10) || 50;
  }
  return args;
}

function isAllDay(e: any): boolean {
  return Boolean(e.datetype === 'date' || (e.start?.dateOnly) || (typeof e.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.start)));
}

function tokenizeTitle(title: string): string[] {
  const text = (title || '').toLowerCase().normalize('NFKD').replace(/[\p{Diacritic}]/gu, '');
  const tokens = text.replace(/[^a-z0-9@._\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = new Set(['the','and','for','with','you','your','are','this','that','from','meeting','call','sync','weekly','biweekly','standup','update','review','kickoff','check','di','da','con','per','su','tra','fra','un','una','del','della','dei','degli','le','la','il','lo','i','gli','e','o','a','al','ai','agli','alle','alla','dell','in','riunione','team','client','cliente','sales','prod','prodotto','tecnico']);
  return tokens.filter(t => t.length >= 3 && !stop.has(t));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (!args.ics) throw new Error('Passa --ics <file.ics>');
  const cfg = buildConfig({ fromArg: args.from, categoriesFileArg: args.categories, useAIArg: args.ai });
  const timeMin = new Date(cfg.startDateISO + 'T00:00:00.000Z').getTime();

  const icsPath = path.resolve(process.cwd(), args.ics);
  const content = fs.readFileSync(icsPath, 'utf8');
  const parsed = ical.parseICS(content);

  const events: { title: string; startMs: number; endMs: number; hours: number }[] = [];
  for (const k of Object.keys(parsed)) {
    const e: any = parsed[k];
    if (!e || e.type !== 'VEVENT') continue;
    const start = e.start ? new Date(e.start).getTime() : NaN;
    const end = e.end ? new Date(e.end).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end < timeMin) continue;
    const allDay = isAllDay(e);
    const hours = allDay ? 0 : Math.max(0, (end - start) / (1000*60*60));
    events.push({ title: e.summary || 'Senza titolo', startMs: start, endMs: end, hours });
  }

  const categories = loadCategories(cfg.categoriesFile);
  const labeled = await labelEvents(
    events
      .map(ev => ({ title: ev.title, dateISO: new Date(ev.startMs).toISOString(), hours: Number(ev.hours.toFixed(2)) }))
      .filter(ev => ev.hours > 0),
    categories,
    { useAI: cfg.useAI, geminiApiKey: cfg.geminiApiKey }
  );

  const uncat = labeled
    .map((le, idx) => ({ ...le, startMs: events[idx].startMs }))
    .filter(le => le.category === 'non categorizzato')
    .sort((a,b)=>a.startMs-b.startMs);

  const freq = new Map<string, number>();
  uncat.forEach(le => { for (const t of tokenizeTitle(le.title)) freq.set(t, (freq.get(t)||0)+1); });
  const topTokens = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([token,count])=>({ token, count }));

  const titleCounts = new Map<string, number>();
  uncat.forEach(le => titleCounts.set(le.title, (titleCounts.get(le.title)||0)+1));
  const topTitles = Array.from(titleCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([title,count])=>({ title, count }));

  const sample = uncat.slice(-args.limit).map(le => ({ date: new Date(le.startMs).toISOString().slice(0,10), hours: le.hours, title: le.title }));

  const summary = {
    window: { from: cfg.startDateISO },
    uncat: { count: uncat.length, hours: Number(uncat.reduce((s,x)=>s+x.hours,0).toFixed(2)) },
    topTokens,
    topTitles,
    sample
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
