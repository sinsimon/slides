/**
 * Test della logica di salvataggio (locale vs S3)
 * Non richiede credenziali API, testa solo la logica di routing
 */

import { isLambdaEnvironment, saveJsonFile } from '../src/data/avacy/pollers/s3-utils';
import { existsSync } from 'fs';
import { join } from 'path';

async function main() {
	console.log('🧪 Test Logica Salvataggio');
	console.log('==========================\n');

	// Test 1: Verifica rilevamento ambiente
	console.log('📋 Test 1: Rilevamento Ambiente');
	console.log('─────────────────────────────────');
	
	const isLambda = isLambdaEnvironment();
	console.log(`   Ambiente Lambda: ${isLambda ? '✅ Sì' : '❌ No (locale)'}`);
	
	if (isLambda) {
		console.log('   ⚠️  AWS_LAMBDA_FUNCTION_NAME è impostato');
		console.log('   Rimuovilo per testare modalità locale');
	} else {
		console.log('   ✅ Modalità locale rilevata correttamente');
	}
	
	console.log('');

	// Test 2: Salvataggio locale (se non siamo su Lambda)
	if (!isLambda) {
		console.log('📋 Test 2: Salvataggio Locale');
		console.log('─────────────────────────────');
		
		const testData = {
			test: true,
			timestamp: new Date().toISOString(),
			message: 'Test file from save logic test',
		};

		try {
			await saveJsonFile('test/test-save-logic.json', testData);
			
			const expectedPath = join(process.cwd(), 'src', 'data', 'avacy', 'json', 'test', 'test-save-logic.json');
			if (existsSync(expectedPath)) {
				console.log('   ✅ File salvato correttamente in locale');
				console.log(`   📁 Path: ${expectedPath}`);
				
				// Cleanup
				const { unlinkSync, rmdirSync } = await import('fs');
				unlinkSync(expectedPath);
				try {
					rmdirSync(join(process.cwd(), 'src', 'data', 'avacy', 'json', 'test'));
				} catch {
					// Directory non vuota o errore, va bene
				}
				console.log('   🧹 File di test rimosso');
			} else {
				console.error('   ❌ File non trovato nel percorso atteso');
				process.exit(1);
			}
		} catch (error: any) {
			console.error('   ❌ Errore durante il salvataggio:', error.message);
			process.exit(1);
		}
	} else {
		console.log('📋 Test 2: Salvataggio S3 (simulato)');
		console.log('─────────────────────────────────────');
		console.log('   ⚠️  Test saltato: siamo in ambiente Lambda');
		console.log('   Per testare S3, usa: npm run test:poller:s3');
	}

	console.log('');
	console.log('✅ Test completato con successo!');
	console.log('');
	console.log('💡 Prossimi passi:');
	console.log('   1. Configura il file .env con le credenziali API');
	console.log('   2. Esegui: npm run test:poller:local (richiede credenziali)');
	console.log('   3. Per test S3: npm run test:poller:s3');
}

main().catch((error) => {
	console.error('Errore fatale:', error);
	process.exit(1);
});


