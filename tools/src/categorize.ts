import type { CategorySpec, ExampleItem } from './config.js';

export type LabeledEvent = {
  title: string;
  dateISO: string;
  hours: number;
  category: string; // categoria assegnata o 'non categorizzato'
};

function matchByKeywords(title: string, categories: CategorySpec[]): string | null {
  const t = (title || '').toLowerCase();
  let best: { name: string; score: number } | null = null;
  for (const c of categories) {
    const kws = (c.keywords || []).map(k => k.toLowerCase());
    let score = 0;
    for (const kw of kws) {
      if (t.includes(kw)) score = Math.max(score, kw.length);
    }
    if (score > 0 && (!best || score > best.score)) best = { name: c.name, score };
  }
  return best?.name || null;
}

async function aiClassifySingle(title: string, categories: string[], apiKey?: string, modelName: string = 'gemini-1.5-flash', examples: ExampleItem[] = []): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const fewShot = examples.slice(0, 6).map(e => `Titolo: "${e.title}" -> Categoria: ${e.category}`).join('\n');
    const prompt = `${fewShot ? `Esempi:\n${fewShot}\n\n` : ''}Categorie disponibili: ${categories.join(', ')}.\nScegli UNA categoria per il titolo seguente. Rispondi SOLO con il nome esatto della categoria, oppure 'non categorizzato'.\nTitolo: "${title}"`;
    const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }]}], generationConfig: { temperature: 0 } });
    const text = r.response.text().trim();
    const normalized = text.replace(/^"|"$/g, '');
    if (categories.includes(normalized)) return normalized;
    if (normalized.toLowerCase().includes('non categ')) return 'non categorizzato';
    return null;
  } catch {
    return null;
  }
}

async function aiClassifyBatch(titles: string[], categories: string[], apiKey?: string, modelName: string = 'gemini-1.5-flash', examples: ExampleItem[] = []): Promise<(string | null)[]> {
  if (!apiKey || titles.length === 0) return titles.map(() => null);
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const fewShot = examples.slice(0, 8).map(e => `Titolo: "${e.title}" -> Categoria: ${e.category}`).join('\n');
    const list = titles.map((t, i) => `${i+1}. ${t}`).join('\n');
    const prompt = `${fewShot ? `Esempi:\n${fewShot}\n\n` : ''}Categorie disponibili: ${categories.join(', ')}.\nClassifica i seguenti titoli, rispondendo con UNA categoria per riga nello stesso ordine. Se nessuna si applica, scrivi 'non categorizzato'.\n\n${list}`;
    const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }]}], generationConfig: { temperature: 0 } });
    const text = r.response.text().trim();
    const lines = text.split(/\r?\n/).map(l => l.trim().replace(/^"|"$/g, ''));
    const out: (string|null)[] = [];
    for (let i = 0; i < titles.length; i++) {
      const v = lines[i] || '';
      if (categories.includes(v)) out.push(v);
      else if (v.toLowerCase().includes('non categ')) out.push('non categorizzato');
      else out.push(null);
    }
    return out;
  } catch {
    return titles.map(() => null);
  }
}

export async function labelEvents(
  events: { title: string; dateISO: string; hours: number }[],
  categories: CategorySpec[],
  opts: { useAI?: boolean; geminiApiKey?: string; geminiModel?: string; aiBatchSize?: number; examples?: ExampleItem[] } = {}
): Promise<LabeledEvent[]> {
  const names = categories.map(c => c.name);
  const out: LabeledEvent[] = [];

  // Prima passata: keyword
  const pendingIdx: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const byKw = matchByKeywords(e.title, categories);
    if (byKw) out.push({ ...e, category: byKw });
    else { out.push({ ...e, category: 'non categorizzato' }); pendingIdx.push(i); }
  }

  if (!opts.useAI || pendingIdx.length === 0) return out;

  // Seconda passata: AI in batch
  const batchSize = Math.max(1, opts.aiBatchSize || 50);
  for (let start = 0; start < pendingIdx.length; start += batchSize) {
    const slice = pendingIdx.slice(start, start + batchSize);
    const titles = slice.map(i => events[i].title);
    const predictions = await aiClassifyBatch(titles, names, opts.geminiApiKey, opts.geminiModel, opts.examples || []);
    for (let j = 0; j < slice.length; j++) {
      const idx = slice[j];
      const cat = predictions[j];
      if (cat) out[idx].category = cat;
    }
  }

  return out;
}


