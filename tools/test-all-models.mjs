import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBPaGY6cxhz85TxIewOF2RoyCvZs26xx80';
const genAI = new GoogleGenerativeAI(apiKey);

// Lista di modelli da testare
const models = [
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-thinking-exp',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-pro-vision'
];

console.log('🔍 Test modelli disponibili con API key corrente...\n');

for (const modelName of models) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('OK');
    const text = result.response.text();
    console.log(`✅ ${modelName} - DISPONIBILE (risposta: ${text.trim().substring(0, 20)})`);
  } catch (e) {
    const status = e.status || e.statusCode || 'N/A';
    if (status === 429) {
      console.log(`⏳ ${modelName} - QUOTA ESAURITA (ma modello esiste)`);
    } else if (status === 404) {
      console.log(`❌ ${modelName} - NON DISPONIBILE (404)`);
    } else {
      console.log(`⚠️  ${modelName} - Status: ${status}`);
    }
  }
}
