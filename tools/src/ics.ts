import fs from 'node:fs';
import ical from 'node-ical';

export type IcsEvent = {
  id: string;
  summary: string;
  start: string; // ISO
  end: string;   // ISO
  durationHours: number;
};

export function parseIcs(filePath: string, opts: { timeMinISO?: string; timeMaxISO?: string } = {}): IcsEvent[] {
  const data = fs.readFileSync(filePath, 'utf8');
  const parsed = ical.parseICS(data);
  const events: IcsEvent[] = [];
  const min = opts.timeMinISO ? new Date(opts.timeMinISO).getTime() : undefined;
  const max = opts.timeMaxISO ? new Date(opts.timeMaxISO).getTime() : undefined;

  for (const key of Object.keys(parsed)) {
    const e = parsed[key] as any;
    if (!e || e.type !== 'VEVENT') continue;
    const startDate: Date | undefined = e.start ? new Date(e.start) : undefined;
    const endDate: Date | undefined = e.end ? new Date(e.end) : undefined;
    if (!startDate || !endDate) continue;

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    if (min && endMs < min) continue;
    if (max && startMs > max) continue;

    const isAllDay = e.datetype === 'date' || (e.start && e.start.dateOnly);
    let durationHours = 0;
    if (!isAllDay) {
      durationHours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));
    }

    events.push({
      id: e.uid || key,
      summary: e.summary || 'Senza titolo',
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      durationHours
    });
  }

  // Ordina per data inizio
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}




