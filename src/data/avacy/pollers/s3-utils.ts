import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Determina se siamo in esecuzione su Lambda (produzione)
 */
export function isLambdaEnvironment(): boolean {
	return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

/**
 * Salva un file JSON. In produzione (Lambda) salva su S3, in locale su filesystem.
 * 
 * @param relativePath - Percorso relativo da src/data/avacy/json/ (es: 'stripe/new-subscriptions.json')
 * @param content - Contenuto JSON da salvare (oggetto o stringa già serializzata)
 */
export async function saveJsonFile(
	relativePath: string,
	content: object | string
): Promise<void> {
	const isLambda = isLambdaEnvironment();
	
	if (isLambda) {
		// Produzione: salva su S3
		const bucket = process.env.AWS_S3_BUCKET;
		if (!bucket) {
			throw new Error('AWS_S3_BUCKET environment variable is required in Lambda environment');
		}
		
		const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
		const s3Key = `data/avacy/json/${relativePath}`;
		const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
		
		await s3Client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: s3Key,
				Body: body,
				ContentType: 'application/json',
			})
		);
		
		console.log(`✓ Saved to S3: s3://${bucket}/${s3Key}`);
	} else {
		// Locale: salva su filesystem
		const outDir = join(process.cwd(), 'src', 'data', 'avacy', 'json', dirname(relativePath));
		mkdirSync(outDir, { recursive: true });
		const filePath = join(outDir, relativePath.split('/').pop() || relativePath);
		const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
		writeFileSync(filePath, contentStr, 'utf8');
		console.log(`✓ Saved locally: ${filePath}`);
	}
}

/**
 * Helper per ottenere il percorso completo locale (solo per uso locale)
 */
export function getLocalJsonPath(relativePath: string): string {
	return join(process.cwd(), 'src', 'data', 'avacy', 'json', relativePath);
}


