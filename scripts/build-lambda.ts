import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
	console.log('🔨 Building Lambda function...');

	// Crea directory dist se non esiste
	const { mkdirSync } = await import('fs');
	try {
		mkdirSync('dist', { recursive: true });
	} catch (e) {
		// Ignora se esiste già
	}

	const result = await build({
		entryPoints: ['src/data/avacy/pollers/lambda-handler.ts'],
		bundle: true,
		platform: 'node',
		target: 'node18',
		format: 'cjs',
		outfile: 'dist/index.js',
		external: ['@aws-sdk/*'],
		minify: false,
		sourcemap: false,
	});

	if (result.errors.length > 0) {
		console.error('❌ Build errors:', result.errors);
		process.exit(1);
	}

	console.log('✅ Lambda built successfully: dist/index.js');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

