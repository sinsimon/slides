import type { CategorySpec, ExampleItem } from './config.js';

export type LabeledEmail = {
  subject: string;
  body: string;
  from: string;
  dateISO: string;
  category: string; // categoria assegnata o 'non categorizzato'
  riassunto?: string; // riassunto di 3-4 parole
  risolto?: boolean; // se il problema è stato risolto
};

function matchByKeywords(text: string, categories: CategorySpec[]): string | null {
  const t = (text || '').toLowerCase();
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

export async function aiClassifySingle(
  subject: string,
  body: string,
  categories: string[],
  apiKey?: string,
  modelName: string = 'gemini-3-pro-preview',
  examples: ExampleItem[] = []
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });

    const fewShot = examples
      .slice(0, 6)
      .map(e => `Oggetto: "${e.title}" -> Categoria: ${e.category}`)
      .join('\n');

    const textContent = `${subject}\n\n${body}`;

    const prompt = `${fewShot ? `Esempi:\n${fewShot}\n\n` : ''}Categorie disponibili: ${categories.join(', ')}.\n
Analizza questa email di support e classificala in UNA delle seguenti categorie:
- "Feature Mancante": richiesta di nuova funzionalità o miglioramento
- "Bug": segnalazione di errore o malfunzionamento
- "Problema UI": problemi di interfaccia utente, usabilità, design
- "Problema Fatturazione": questioni relative a pagamenti, fatture, abbonamenti

Rispondi SOLO con il nome esatto della categoria, oppure 'Altro' se nessuna si applica.

Email:
Oggetto: "${subject}"
Corpo: "${textContent}"`;

    const res = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const text = (res as any).text?.trim?.() ?? res?.response?.text?.()?.trim?.() ?? '';
    const normalized = text.replace(/^"|"$/g, '').trim();
    if (categories.includes(normalized)) return normalized;
    if (normalized.toLowerCase().includes('non categ') || normalized.toLowerCase().includes('altro')) {
      return categories.includes('Altro') ? 'Altro' : null;
    }
    return null;
  } catch (err) {
    console.error('Errore AI classification:', err);
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function aiClassifyBatch(
  emails: { subject: string; body: string }[],
  categories: string[],
  apiKey?: string,
  modelName: string = 'gemini-3-pro-preview',
  examples: ExampleItem[] = [],
  maxRetries: number = 3
): Promise<(string | null)[]> {
  if (!apiKey || emails.length === 0) return emails.map(() => null);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });

    const fewShot = examples
      .slice(0, 8)
      .map(e => `Oggetto: "${e.title}" -> Categoria: ${e.category}`)
      .join('\n');

    const list = emails
      .map((e, i) => {
        // Usa il body completo per una categorizzazione migliore
        const text = `${e.subject}\n${e.body}`;
        return `${i + 1}. Oggetto: "${e.subject}"\n   Corpo: "${text}"`;
      })
      .join('\n\n');

    const prompt = `${fewShot ? `Esempi:\n${fewShot}\n\n` : ''}Categorie disponibili: ${categories.join(', ')}.\n
Classifica queste email di support in UNA delle seguenti categorie per ciascuna:
- "Feature Mancante": richiesta di nuova funzionalità o miglioramento
- "Bug": segnalazione di errore o malfunzionamento
- "Problema UI": problemi di interfaccia utente, usabilità, design
- "Problema Fatturazione": questioni relative a pagamenti, fatture, abbonamenti

Rispondi con UNA categoria per riga nello stesso ordine. Se nessuna si applica, scrivi 'non categorizzato'.

Email:\n\n${list}`;

    const res = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const text = (res as any).text?.trim?.() ?? res?.response?.text?.()?.trim?.() ?? '';
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim().replace(/^"|"$/g, '').replace(/^\d+\.\s*/, ''))
      .filter(Boolean);
    const out: (string | null)[] = [];
    for (let i = 0; i < emails.length; i++) {
      const v = lines[i] || '';
      if (categories.includes(v)) out.push(v);
      else if (v.toLowerCase().includes('non categ')) out.push('non categorizzato');
      else out.push(null);
    }
      return out;
    } catch (err: any) {
      const isRateLimit = err?.status === 429;
      const retryDelay = err?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryDelay ? parseFloat(retryDelay) * 1000 : Math.pow(2, attempt) * 1000;
        console.log(`Rate limit raggiunto, attendo ${Math.round(delay / 1000)}s prima di riprovare...`);
        await sleep(delay);
        continue;
      }
      console.error('Errore AI batch classification:', err);
      return emails.map(() => null);
    }
  }
  return emails.map(() => null);
}

export async function labelEmails(
  emails: { subject: string; body: string; from: string; dateISO: string }[],
  categories: CategorySpec[],
  opts: {
    useAI?: boolean;
    geminiApiKey?: string;
    geminiModel?: string;
    aiBatchSize?: number;
    examples?: ExampleItem[];
  } = {}
): Promise<LabeledEmail[]> {
  const names = categories.map(c => c.name);
  const out: LabeledEmail[] = [];

  // Prima passata: keyword matching su subject + body
  const pendingIdx: number[] = [];
  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    const combinedText = `${e.subject} ${e.body}`;
    const byKw = matchByKeywords(combinedText, categories);
    if (byKw) {
      out.push({ ...e, category: byKw });
    } else {
      out.push({ ...e, category: 'non categorizzato' });
      pendingIdx.push(i);
    }
  }

  if (!opts.useAI || pendingIdx.length === 0) return out;

  // Seconda passata: AI in batch
  const batchSize = Math.max(1, opts.aiBatchSize || 20); // Batch più piccoli per email (più testo)
  for (let start = 0; start < pendingIdx.length; start += batchSize) {
    const slice = pendingIdx.slice(start, start + batchSize);
    const emailBatch = slice.map(i => ({
      subject: emails[i].subject,
      body: emails[i].body
    }));
    const predictions = await aiClassifyBatch(
      emailBatch,
      names,
      opts.geminiApiKey,
      opts.geminiModel,
      opts.examples || []
    );
    for (let j = 0; j < slice.length; j++) {
      const idx = slice[j];
      const cat = predictions[j];
      if (cat) out[idx].category = cat;
    }
  }

  return out;
}

export async function generateSummary(
  subject: string,
  body: string,
  apiKey?: string,
  modelName: string = 'gemini-3-pro-preview',
  maxRetries: number = 3
): Promise<string | null> {
  if (!apiKey) return null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });

    // Usa il body completo per un riassunto migliore
    const textContent = `${subject}\n\n${body}`;
    const prompt = `Genera un riassunto di 3-4 parole per questa email di support. Rispondi SOLO con le 3-4 parole, senza punti o virgole.

Email:
Oggetto: "${subject}"
Corpo: "${textContent}"`;

    const res = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 20 }
    });
      const text = (res as any).text?.trim?.() ?? res?.response?.text?.()?.trim?.() ?? '';
      return text.replace(/^"|"$/g, '').trim() || null;
    } catch (err: any) {
      const isRateLimit = err?.status === 429;
      const retryDelay = err?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryDelay ? parseFloat(retryDelay) * 1000 : Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      console.error('Errore generazione riassunto:', err);
      return null;
    }
  }
  return null;
}

export async function determineIfResolved(
  threadMessages: { date: string; isFromSupport: boolean; body: string }[],
  apiKey?: string,
  modelName: string = 'gemini-3-pro-preview',
  maxRetries: number = 3
): Promise<boolean> {
  if (threadMessages.length === 0) return false;
  
  if (!apiKey) {
    // Fallback: se l'ultimo messaggio è dal support e sono passati più di 7 giorni senza risposta, considera risolto
    const lastMsg = threadMessages[threadMessages.length - 1];
    if (lastMsg.isFromSupport) {
      const daysSinceLastMsg = (Date.now() - new Date(lastMsg.date).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastMsg > 7;
    }
    return false;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });

    // Prendi gli ultimi messaggi del thread
    const recentMessages = threadMessages.slice(-5).map((m, i) => 
      `${i + 1}. ${m.isFromSupport ? '[SUPPORT]' : '[CLIENTE]'} ${m.date.slice(0, 10)}: ${m.body.slice(0, 200)}`
    ).join('\n');

    const lastMsg = threadMessages[threadMessages.length - 1];
    const daysSinceLastMsg = (Date.now() - new Date(lastMsg.date).getTime()) / (1000 * 60 * 60 * 24);

    const prompt = `Analizza questa conversazione di support e determina se il problema è stato risolto.

Criteri:
- Se l'ultimo messaggio è dal support e sono passati più di 7 giorni senza risposta dal cliente, probabilmente è risolto
- Se ci sono keyword come "risolto", "fixed", "grazie", "perfetto", "funziona", probabilmente è risolto
- Se il cliente continua a rispondere con problemi, probabilmente NON è risolto

Conversazione:
${recentMessages}

Giorni dall'ultimo messaggio: ${Math.floor(daysSinceLastMsg)}

Rispondi SOLO con "SI" o "NO".`;

    const res = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 }
    });
      const text = (res as any).text?.toUpperCase?.() ?? res?.response?.text?.()?.toUpperCase?.() ?? '';
      return text.includes('SI') || text.includes('YES');
    } catch (err: any) {
      const isRateLimit = err?.status === 429;
      const retryDelay = err?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryDelay ? parseFloat(retryDelay) * 1000 : Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      console.error('Errore determinazione risolto:', err);
      // Fallback
      const lastMsg = threadMessages[threadMessages.length - 1];
      if (lastMsg.isFromSupport) {
        const daysSinceLastMsg = (Date.now() - new Date(lastMsg.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceLastMsg > 7;
      }
      return false;
    }
  }
  // Fallback finale
  const lastMsg = threadMessages[threadMessages.length - 1];
  if (lastMsg.isFromSupport) {
    const daysSinceLastMsg = (Date.now() - new Date(lastMsg.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastMsg > 7;
  }
  return false;
}
