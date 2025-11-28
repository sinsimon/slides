/**
 * Script per testare la funzionalità S3 dei poller
 * Simula l'ambiente Lambda per verificare che i file vengano salvati su S3
 */

import * as dotenv from 'dotenv';
import { saveJsonFile } from '../src/data/avacy/pollers/s3-utils';

dotenv.config();

async function main() {
	console.log('🧪 Test Poller S3 (simulazione Lambda)');
	console.log('=====================================\n');

	// Verifica variabili d'ambiente
	const bucket = process.env.AWS_S3_BUCKET;
	const region = process.env.AWS_REGION || 'eu-central-1';

	if (!bucket) {
		console.error('❌ Errore: AWS_S3_BUCKET non è impostato');
		console.error('   Imposta AWS_S3_BUCKET nel tuo .env o come variabile d\'ambiente');
		process.exit(1);
	}

	// Simula ambiente Lambda
	process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-poller-function';

	console.log(`📦 Bucket: ${bucket}`);
	console.log(`🌍 Region: ${region}`);
	console.log(`🔧 Ambiente: Lambda (simulato)\n`);

	// Test: salva un file JSON di test
	const testData = {
		test: true,
		timestamp: new Date().toISOString(),
		message: 'Test file from poller S3 test script',
	};

	try {
		console.log('📤 Test upload su S3...');
		await saveJsonFile('test/test-file.json', testData);
		console.log('✅ File caricato con successo su S3!\n');

		// Verifica che il file esista su S3
		const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
		const s3Client = new S3Client({ region });

		try {
			await s3Client.send(
				new HeadObjectCommand({
					Bucket: bucket,
					Key: 'data/avacy/json/test/test-file.json',
				})
			);
			console.log('✅ Verifica: file presente su S3');
		} catch (error: any) {
			if (error.name === 'NotFound') {
				console.error('❌ Errore: file non trovato su S3 dopo l\'upload');
				process.exit(1);
			}
			throw error;
		}

		// Cleanup: rimuovi il file di test
		console.log('\n🧹 Cleanup: rimozione file di test...');
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		await s3Client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: 'data/avacy/json/test/test-file.json',
			})
		);
		console.log('✅ File di test rimosso\n');

		console.log('🎉 Test completato con successo!');
		console.log('   I poller funzioneranno correttamente su Lambda');
	} catch (error: any) {
		console.error('❌ Errore durante il test:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	} finally {
		// Rimuovi la simulazione
		delete process.env.AWS_LAMBDA_FUNCTION_NAME;
	}
}

main().catch((error) => {
	console.error('Errore fatale:', error);
	process.exit(1);
});


