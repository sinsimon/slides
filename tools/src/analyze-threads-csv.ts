import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateSummary, determineIfResolved, labelEmails } from './categorize-emails.js';
import { loadCategories } from './config.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(process.cwd(), '.env') });

// Parse argomenti da riga di comando
const args = process.argv.slice(2);
let limitArg: number | undefined;
let startRowArg: number | undefined; // 1-based, es: --start-row 128
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limitArg = parseInt(args[i + 1], 10);
    i++;
  } else if ((args[i] === '--start-row' || args[i] === '--from-row') && args[i + 1]) {
    startRowArg = parseInt(args[i + 1], 10);
    i++;
  }
}

const csvFile = resolve(__dirname, '../output/emails_export_PER_THREAD.csv');
const outputFile = resolve(__dirname, '../output/emails_export_PER_THREAD_AI.csv');
const checkpointFile = resolve(__dirname, '../.cache/threads-checkpoint.json');

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error('❌ ERRORE: GEMINI_API_KEY non trovata nel .env');
  process.exit(1);
}
console.log('🔍 DEBUG - API Key da env:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 20) + '...' : 'NON TROVATA');
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

console.log(`📖 Leggendo: ${csvFile}`);
console.log(`🔑 Usando API Key: ${geminiApiKey.substring(0, 20)}...`);
console.log(`🤖 Modello: ${geminiModel}\n`);

const csvContent = readFileSync(csvFile, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  bom: true
}) as any[];

console.log(`📊 Thread trovati: ${records.length}`);

// Carica checkpoint se esiste
let checkpoint: Record<string, { categoria: string; riassunto: string; risolto: string }> = {};
try {
  const checkpointData = readFileSync(checkpointFile, 'utf-8');
  checkpoint = JSON.parse(checkpointData);
  console.log(`📋 Checkpoint trovato: ${Object.keys(checkpoint).length} thread già processati\n`);
} catch {
  console.log(`📋 Nessun checkpoint trovato, partendo da zero\n`);
}

// Carica categorie EMAIL (non calendario)
const categoriesFile = resolve(__dirname, '../../tools/categories-emails.sample.json');
const categories = loadCategories(categoriesFile);
const categoryNames = categories.map(c => c.name);
console.log(`📁 Categorie caricate: ${categoryNames.join(', ')}`);

// Processa ogni thread
let processed = 0;
let skipped = 0;
const LIMIT = limitArg; // Limite di thread da processare (se specificato con --limit)
const START_INDEX = startRowArg ? Math.max(0, startRowArg - 1) : 0; // indice 0-based da cui partire

async function processThreads() {
  const maxRecords = LIMIT
    ? Math.min(records.length, START_INDEX + LIMIT)
    : records.length;

  if (START_INDEX > 0 || LIMIT) {
    console.log(
      `\n⚠️  Finestra attiva: processando thread da ${START_INDEX + 1} a ${maxRecords} (totale ${records.length})\n`
    );
  }
  
  for (let i = START_INDEX; i < maxRecords; i++) {
    const thread = records[i];
    const threadId = thread.threadId || thread.numeroMail;
    
    // Salta se già processato nel checkpoint
    if (checkpoint[threadId] && checkpoint[threadId].categoria && checkpoint[threadId].riassunto) {
      skipped++;
      if (skipped % 50 === 0) {
        process.stdout.write(`\r⏭️  Saltati ${skipped} thread già processati...`);
      }
      continue;
    }
    
    processed++;
    console.log(`\n🔄 Thread ${i + 1}/${maxRecords} - ${threadId.substring(0, 12)}...`);
    console.log(`  📧 Subject: "${thread.subject.substring(0, 60)}${thread.subject.length > 60 ? '...' : ''}"`);
    
    let categoria = thread.categoria || '';
    let riassunto = thread.riassunto || '';
    let risolto = thread.risolto || '';
    
    // Verifica se la categoria è una delle categorie nuove (se è vecchia, riprocessa)
    const hasOldCategory = categoria && categoria.trim() && !categoryNames.includes(categoria.trim());
    
    // Una sola chiamata AI per thread che restituisce JSON con categoria, riassunto, risolto
    // Riprocessa anche se ha categoria vecchia
    if (hasOldCategory || (!categoria || categoria.trim() === '') || (!riassunto || riassunto.trim() === '') || (!risolto || risolto.trim() === '')) {
      if (hasOldCategory) {
        console.log(`  ⚠️  Categoria vecchia trovata: "${categoria}", riprocessando...`);
      }
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: geminiApiKey });
        
        // categoryNames già definito sopra
        const textContent = `${thread.subject}\n\n${thread.body}`;
        
        // Analizza il thread per capire se è risolto
        const threadMessages = thread.body.split('--- Email da').slice(1).map((part: string) => {
          const lines = part.split('\n');
          const firstLine = lines[0] || '';
          const fromMatch = firstLine.match(/(.+?)\s*\(/);
          const from = fromMatch ? fromMatch[1].trim() : '';
          const isFromSupport = from.toLowerCase().includes('jumpgroup') || 
                               from.toLowerCase().includes('avacy') ||
                               from.toLowerCase().includes('support');
          const body = lines.slice(1).join('\n').trim();
          return { from, body, isFromSupport };
        });
        
        const lastMsg = threadMessages[threadMessages.length - 1];
        const daysSinceLastMsg = lastMsg ? (Date.now() - new Date(thread.data).getTime()) / (1000 * 60 * 60 * 24) : 0;
        
        const prompt = `Analizza questa conversazione di support e rispondi con un JSON contenente:

1. "categoria": una delle seguenti categorie (nome esatto):
   - "Problemi Setup/Installazione": problemi durante installazione, configurazione, integrazione di script/tag nel sito
   - "Aiuto su Utilizzo Piattaforma": richieste di aiuto su come usare funzionalità esistenti, dove trovare cose, come visualizzare dati
   - "Bug": segnalazione di errore, malfunzionamento, qualcosa che non funziona come dovrebbe
   - "Richiesta Feature": richiesta di nuova funzionalità o miglioramento che non esiste ancora
   - "Problema Fatturazione": questioni relative a pagamenti, fatture, abbonamenti, rimborsi
   - "Altro": email non di supporto (es. newsletter, promozioni, proposte commerciali, inviti a eventi, candidature, spam)

2. "riassunto": un riassunto di 3-4 parole del problema

3. "risolto": 
   - true SOLO se il supporto ha effettivamente risolto il problema e il cliente ha ottenuto quello che voleva
   - false se:
     * È una feature richiesta ma non fornita/implementata (es: "non abbiamo questa funzionalità", "valuteremo in futuro")
     * Il sistema/tecnologia non è supportata (es: "non supportiamo Nuxt SSR", "non compatibile con...")
     * Il cliente non ha ottenuto quello che voleva
     * Il problema non è stato risolto
     * Il thread si è chiuso senza soluzione concreta
   
   IMPORTANTE: Non basarti solo sul fatto che il supporto abbia risposto. Verifica se il problema è stato effettivamente risolto.

Rispondi SOLO con un JSON valido in questo formato:
{
  "categoria": "nome categoria",
  "riassunto": "3-4 parole",
  "risolto": true/false
}

Conversazione:
Oggetto: "${thread.subject}"
Corpo: "${textContent.substring(0, 8000)}"
Ultimo messaggio dal support: ${lastMsg?.isFromSupport ? 'SI' : 'NO'}
Giorni dall'ultimo messaggio: ${Math.floor(daysSinceLastMsg)}`;

        const res = await client.models.generateContent({
          model: geminiModel,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
          }
        });
        
        let text = (res as any).text?.trim() ?? res?.response?.text?.()?.trim() ?? '';
        
        // Rimuovi markdown code blocks se presenti
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        
        try {
          const json = JSON.parse(text);
          if (json.categoria && categoryNames.includes(json.categoria)) {
            categoria = json.categoria;
          }
          if (json.riassunto) {
            riassunto = json.riassunto.trim();
          }
          if (typeof json.risolto === 'boolean') {
            risolto = json.risolto ? 'true' : 'false';
          } else if (typeof json.risolto === 'string') {
            risolto = json.risolto.toLowerCase() === 'true' ? 'true' : 'false';
          }
          
          console.log(`  📁 Categoria AI: "${categoria}"`);
          console.log(`  📝 Riassunto AI: "${riassunto}"`);
          console.log(`  ✅ Risolto AI: ${risolto}`);
        } catch (parseErr) {
          console.error(`\n⚠️  Errore parsing JSON, risposta: ${text.substring(0, 200)}`);
          // Fallback: prova a estrarre i valori dal testo
          const categoriaMatch = text.match(/"categoria"\s*:\s*"([^"]+)"/i);
          const riassuntoMatch = text.match(/"riassunto"\s*:\s*"([^"]+)"/i);
          const risoltoMatch = text.match(/"risolto"\s*:\s*(true|false)/i);
          
          if (categoriaMatch && categoryNames.includes(categoriaMatch[1])) {
            categoria = categoriaMatch[1];
          }
          if (riassuntoMatch) {
            riassunto = riassuntoMatch[1].trim();
          }
          if (risoltoMatch) {
            risolto = risoltoMatch[1].toLowerCase() === 'true' ? 'true' : 'false';
          }
        }
        
        await sleep(500); // Rate limiting
      } catch (err: any) {
        console.error(`\n❌ Errore AI thread ${threadId}:`, err.message);
        // Non impostare categoria di default se errore, lascia vuoto per riprovare
        if (!categoria) categoria = '';
        if (!riassunto) riassunto = '';
        if (!risolto) risolto = '';
      }
    }
    
    // Aggiorna record
    thread.categoria = categoria;
    thread.riassunto = riassunto;
    thread.risolto = risolto;
    
    // Salva nel checkpoint
    checkpoint[threadId] = {
      categoria,
      riassunto,
      risolto
    };
    
    // Salva checkpoint e CSV dopo ogni thread completato
    writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf-8');
    
    // Genera e salva CSV aggiornato, eliminando le righe non di supporto (categoria "Altro")
    const supportRecords = records.filter(r => r.categoria && r.categoria.trim() && r.categoria.trim() !== 'Altro');
    const outputCsv = stringify(supportRecords, {
      header: true,
      columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'to', 'data', 'categoria', 'riassunto', 'risolto', 'body']
    });
    writeFileSync(outputFile, outputCsv, 'utf-8');
    
    console.log(`✅ Thread ${i + 1} completato: categoria="${categoria}", riassunto="${riassunto}", risolto=${risolto}`);
    console.log(`💾 CSV aggiornato (solo supporto, escluso "Altro"): ${outputFile}`);
    
    await sleep(1000); // Rate limiting tra thread
  }
  
  // CSV già salvato dopo ogni thread, qui solo messaggio finale
  console.log(`\n\n✅ Completato!`);
  console.log(`📊 Thread processati: ${processed}`);
  console.log(`⏭️  Thread saltati: ${skipped}`);
  console.log(`💾 CSV finale: ${outputFile}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

processThreads().catch(err => {
  console.error('❌ Errore:', err);
  process.exit(1);
});
