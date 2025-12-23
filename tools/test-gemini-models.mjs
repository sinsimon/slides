import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBPaGY6cxhz85TxIewOF2RoyCvZs26xx80';
const genAI = new GoogleGenerativeAI(apiKey);

const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash-exp'];

console.log('Test modelli Gemini...\n');

for (const modelName of models) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Rispondi solo con "OK"');
    const text = result.response.text();
    console.log(`✅ ${modelName} - FUNZIONA (risposta: ${text.trim()})`);
    process.exit(0);
  } catch (e) {
    const status = e.status || e.statusCode || 'N/A';
    const msg = e.message?.slice(0, 80) || String(e).slice(0, 80);
    console.log(`❌ ${modelName} - Status: ${status}, ${msg}`);
  }
}

console.log('\nNessun modello funzionante trovato.');
