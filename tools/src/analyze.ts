import fs from 'node:fs';
import path from 'node:path';
import ical from 'node-ical';
import { buildConfig, loadCategories } from './config.js';
import { labelEvents } from './categorize.js';

function parseArgs(argv: string[]) {
  const args = { from: undefined as string|undefined, ics: undefined as string|undefined, categories: undefined as string|undefined, ai: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i+1]) args.from = argv[++i];
    else if (a === '--ics' && argv[i+1]) args.ics = argv[++i];
    else if (a === '--categories' && argv[i+1]) args.categories = argv[++i];
    else if (a === '--ai') args.ai = true;
  }
  return args;
}

function isAllDay(e: any): boolean {
  // node-ical marks date-only; also detect if start has no time component
  return Boolean(e.datetype === 'date' || (e.start?.dateOnly) || (typeof e.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.start)));
}

function extractAttendees(e: any): string[] {
  const list: string[] = [];
  const raw = e.attendee || e.attendees;
  if (!raw) return list;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const item of arr) {
    if (!item) continue;
    // node-ical attendee may be string or object { params: { CN }, val: 'mailto:..' }
    const name = (item.params && (item.params.CN || item.params.cn)) || undefined;
    const val = typeof item === 'string' ? item : item.val;
    let email = '';
    if (typeof val === 'string') {
      const m = val.match(/mailto:([^;>]+)/i);
      email = m ? m[1] : val;
    }
    const display = name ? `${name} <${email}>` : (email || '').toLowerCase();
    if (display) list.push(display);
  }
  return list;
}

function toYMD(iso: string): string { return iso.slice(0,10); }

function tokenizeTitle(title: string): string[] {
  const text = (title || '').toLowerCase().normalize('NFKD').replace(/[\p{Diacritic}]/gu, '');
  const tokens = text.replace(/[^a-z0-9@._\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = new Set([
    'the','and','for','with','you','your','are','this','that','from','meeting','call','sync','weekly','weekly','biweekly','standup','update','review','kickoff','check','call','meet','di','da','con','per','su','tra','fra','un','una','del','della','dei','degli','le','la','il','lo','i','gli','e','o','a','al','ai','agli','alle','alla','dell','in','di','riunione','all','team','client','cliente','sales','prod','prodotto','prodotto','tech','tecnico']
  );
  return tokens.filter(t => t.length >= 3 && !stop.has(t));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (!args.ics) throw new Error('Passa --ics <file.ics>');
  const cfg = buildConfig({ fromArg: args.from, categoriesFileArg: args.categories, useAIArg: args.ai });
  const timeMin = new Date(cfg.startDateISO + 'T00:00:00.000Z').getTime();
  const timeMax = Date.now();

  const icsPath = path.resolve(process.cwd(), args.ics);
  const content = fs.readFileSync(icsPath, 'utf8');
  const parsed = ical.parseICS(content);

  const events: { title: string; startMs: number; endMs: number; hours: number; attendees: string[] }[] = [];
  for (const k of Object.keys(parsed)) {
    const e: any = parsed[k];
    if (!e || e.type !== 'VEVENT') continue;
    const start = e.start ? new Date(e.start).getTime() : NaN;
    const end = e.end ? new Date(e.end).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end < timeMin || start > timeMax) continue;
    const allDay = isAllDay(e);
    const hours = allDay ? 0 : Math.max(0, (end - start) / (1000*60*60));
    events.push({ title: e.summary || 'Senza titolo', startMs: start, endMs: end, hours, attendees: extractAttendees(e) });
  }

  // Categorizzazione con le stesse categorie
  const categories = loadCategories(cfg.categoriesFile);
  const labeled = await labelEvents(
    events
      .map(ev => ({ title: ev.title, dateISO: new Date(ev.startMs).toISOString(), hours: Number(ev.hours.toFixed(2)) }))
      .filter(ev => ev.hours > 0),
    categories,
    { useAI: cfg.useAI, geminiApiKey: cfg.geminiApiKey }
  );

  // Distribuzione per categoria
  const byCategory = new Map<string, { count: number; hours: number }>();
  labeled.forEach((le, idx) => {
    const key = le.category;
    const cur = byCategory.get(key) || { count: 0, hours: 0 };
    cur.count += 1;
    cur.hours += events[idx].hours;
    byCategory.set(key, cur);
  });

  // Top invitati per ore e per numero di eventi
  const attendeeHours = new Map<string, number>();
  const attendeeCount = new Map<string, number>();
  events.forEach(ev => {
    const unique = Array.from(new Set(ev.attendees));
    for (const a of unique) {
      attendeeHours.set(a, (attendeeHours.get(a) || 0) + ev.hours);
      attendeeCount.set(a, (attendeeCount.get(a) || 0) + 1);
    }
  });
  const topHours = Array.from(attendeeHours.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,hours])=>({ name, hours: Number(hours.toFixed(2)) }));
  const topCount = Array.from(attendeeCount.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({ name, count }));

  // Top token dal titolo
  const freq = new Map<string, number>();
  events.forEach(ev => {
    for (const tok of tokenizeTitle(ev.title)) freq.set(tok, (freq.get(tok)||0)+1);
  });
  const topTokens = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([token,count])=>({ token, count }));

  const totalHours = events.reduce((s,e)=>s+e.hours,0);

  const result = {
    window: { from: cfg.startDateISO, to: new Date().toISOString().slice(0,10) },
    counts: { events: events.length, hours: Number(totalHours.toFixed(2)) },
    categories: Array.from(byCategory.entries()).map(([category,stats])=>({ category, count: stats.count, hours: Number(stats.hours.toFixed(2)) })).sort((a,b)=>b.hours-a.hours),
    topAttendeesByHours: topHours,
    topAttendeesByCount: topCount,
    topTitleTokens: topTokens
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });


