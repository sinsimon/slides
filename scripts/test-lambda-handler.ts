/**
 * Script per testare il Lambda handler localmente
 * Simula un evento Lambda per verificare che il handler funzioni
 */

import * as dotenv from 'dotenv';
import { handler } from '../src/data/avacy/pollers/lambda-handler';

dotenv.config();

async function main() {
	console.log('🧪 Test Lambda Handler Locale');
	console.log('============================\n');

	// Simula ambiente Lambda
	process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-poller-function';
	process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'test-bucket';

	const testPollers = [
		'stripe:new-subscriptions',
		'stripe:cancellations',
		// Aggiungi altri poller per test completi se necessario
	];

	for (const pollerName of testPollers) {
		console.log(`\n📋 Test poller: ${pollerName}`);
		console.log('─'.repeat(50));

		const mockEvent = { poller: pollerName };
		const mockContext = {
			awsRequestId: 'test-request-id',
			functionName: 'test-poller-function',
			functionVersion: '$LATEST',
			invokedFunctionArn: 'arn:aws:lambda:eu-central-1:123456789012:function:test',
			memoryLimitInMB: '1024',
			getRemainingTimeInMillis: () => 900000,
		} as any;

		try {
			const result = await handler(mockEvent, mockContext);
			console.log('✅ Handler eseguito con successo');
			console.log(`   Status: ${result.statusCode}`);
			if (result.statusCode === 200) {
				const body = JSON.parse(result.body);
				console.log(`   Durata: ${body.durationMs}ms`);
			} else {
				const body = JSON.parse(result.body);
				console.error(`   Errore: ${body.error}`);
			}
		} catch (error: any) {
			console.error('❌ Errore durante l\'esecuzione:', error.message);
			if (error.stack) {
				console.error(error.stack);
			}
		}
	}

	console.log('\n🎉 Test completato!');
}

main().catch((error) => {
	console.error('Errore fatale:', error);
	process.exit(1);
});


