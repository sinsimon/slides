import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyC_JEA1V29pSqR8AApwtvlR3yN80_HUnD4';
const client = new GoogleGenAI({ apiKey });

const models = [
  'gemini-3-pro-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

console.log('🔍 Test modelli con API key AI Studio...\n');

for (const modelName of models) {
  try {
    const res = await client.models.generateContent({
      model: modelName,
      contents: 'OK'
    });
    const text = res.text || '';
    console.log(`✅ ${modelName} - DISPONIBILE (risposta: ${text.substring(0, 30)})`);
  } catch (e) {
    const status = e.status || e.statusCode || 'N/A';
    const msg = e.message || String(e);
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      console.log(`⏳ ${modelName} - QUOTA ESAURITA (ma modello esiste)`);
    } else if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      console.log(`❌ ${modelName} - NON DISPONIBILE (404)`);
    } else {
      console.log(`⚠️  ${modelName} - Status: ${status}, ${msg.substring(0, 60)}`);
    }
  }
}
