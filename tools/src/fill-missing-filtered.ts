import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const csvPath = resolve('tools/output/comma-separated values.filtered.csv');
  const categoriesPath = resolve('tools/categories-emails.sample.json');

  console.log('📖 Leggendo CSV filtrato:', csvPath);
  const csvContent = readFileSync(csvPath, 'utf-8');
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as any[];

  console.log('  Righe dati:', rows.length);

  const categories = JSON.parse(readFileSync(categoriesPath, 'utf-8')) as { name: string }[];
  const categoryNames = categories.map(c => c.name);
  console.log('📁 Categorie:', categoryNames.join(', '));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY non trovata');
    process.exit(1);
  }

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

  // Indici 1-based considerando header -> dati da riga 2, quindi index 0 = riga 2
  const START_ROW = 130; // 1-based, inclusa header
  const END_ROW = 160;   // inclusivo

  let processed = 0;

  for (let idx = START_ROW - 2; idx <= END_ROW - 2 && idx < rows.length; idx++) {
    const row = rows[idx];
    const riassunto = (row.riassunto || '').trim();
    const categoria = (row.categoria || '').trim();
    const risolto = String(row.risolto || '').trim();

    // Salta se già completo
    if (categoria && riassunto && risolto) {
      continue;
    }

    const subject = row.subject || '';
    const body = row.body || '';
    console.log(`\n🔄 Riga CSV ${idx + 2} - threadId=${row.threadId}`);
    console.log(`  📧 Subject: "${subject.substring(0, 80)}"`);

    const textContent = `${subject}\n\n${body}`;

    const prompt = `Analizza questa conversazione di support e rispondi con un JSON contenente:\n\n1. "categoria": una delle seguenti categorie (nome esatto):\n   - "Problemi Setup/Installazione": problemi durante installazione, configurazione, integrazione di script/tag nel sito\n   - "Aiuto su Utilizzo Piattaforma": richieste di aiuto su come usare funzionalità esistenti, dove trovare cose, come visualizzare dati\n   - "Bug": segnalazione di errore, malfunzionamento, qualcosa che non funziona come dovrebbe\n   - "Richiesta Feature": richiesta di nuova funzionalità o miglioramento che non esiste ancora\n   - "Problema Fatturazione": questioni relative a pagamenti, fatture, abbonamenti, rimborsi\n\n2. "riassunto": un riassunto di 3-4 parole del problema\n\n3. "risolto": \n   - true SOLO se il supporto ha effettivamente risolto il problema e il cliente ha ottenuto quello che voleva\n   - false se:\n     * È una feature richiesta ma non fornita/implementata\n     * Il sistema/tecnologia non è supportata\n     * Il cliente non ha ottenuto quello che voleva\n     * Il problema non è stato risolto\n     * Il thread si è chiuso senza soluzione concreta\n\nRispondi SOLO con un JSON valido in questo formato:\n{\n  "categoria": "nome categoria",\n  "riassunto": "3-4 parole",\n  "risolto": true/false\n}\n\nConversazione:\nOggetto: "${subject}"\nCorpo: "${textContent.substring(0, 8000)}"`;

    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });

      let text = (res as any).text?.trim() ?? res?.response?.text?.()?.trim() ?? '';
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      let catOut = categoria;
      let sumOut = riassunto;
      let risOut = risolto;

      try {
        const json = JSON.parse(text);
        if (json.categoria && categoryNames.includes(json.categoria)) {
          catOut = json.categoria;
        }
        if (json.riassunto) {
          sumOut = String(json.riassunto).trim();
        }
        if (typeof json.risolto === 'boolean') {
          risOut = json.risolto ? 'TRUE' : 'FALSE';
        } else if (typeof json.risolto === 'string') {
          risOut = json.risolto.toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
        }
      } catch (e) {
        console.error('⚠️  Errore JSON, risposta grezza:', text.substring(0, 200));
      }

      row.categoria = catOut;
      row.riassunto = sumOut;
      row.risolto = risOut;

      console.log(`  📁 Categoria AI: "${catOut}"`);
      console.log(`  📝 Riassunto AI: "${sumOut}"`);
      console.log(`  ✅ Risolto AI: ${risOut}`);

      processed++;

      // Salva CSV dopo ogni riga aggiornata
      const outCsv = stringify(rows, {
        header: true,
        columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'to', 'data', 'categoria', 'riassunto', 'risolto', 'body'],
      });
      writeFileSync(csvPath, outCsv, 'utf-8');
      console.log('  💾 CSV aggiornato');

      // Piccola pausa per non stressare l'API
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      console.error('❌ Errore AI su riga', idx + 2, '-', err?.message || err);
      break;
    }
  }

  console.log('\n✅ Completato. Righe aggiornate:', processed);
}

main().catch(err => {
  console.error('❌ Errore script fill-missing-filtered:', err);
  process.exit(1);
});
