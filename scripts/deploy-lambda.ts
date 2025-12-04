import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand, UpdateFunctionConfigurationCommand, CreateFunctionCommand, AddPermissionCommand } from '@aws-sdk/client-lambda';
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand, ListTargetsByRuleCommand } from '@aws-sdk/client-eventbridge';
import { readFileSync, unlinkSync, createWriteStream } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import * as dotenv from 'dotenv';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';
import * as cronConfig from '../lambda-cron-config.json';

// Carica .env
dotenv.config();

const LAMBDA_FUNCTION_NAME = 'avacy-pollers';

async function deployLambda(
	bucket: string,
	region: string,
	roleArn: string,
	groupKey: string,
	groupSecret: string
): Promise<void> {
	console.log('📦 Deploying Lambda function...');

	const s3Client = new S3Client({ region });
	const lambdaClient = new LambdaClient({ region });

	// 1. Crea ZIP del bundle
	const zipPath = join(process.cwd(), 'dist', 'lambda.zip');
	const output = createWriteStream(zipPath);
	const archive = archiver('zip', { zlib: { level: 9 } });

	await new Promise<void>((resolve, reject) => {
		output.on('close', () => {
			console.log(`✓ Created ZIP (${archive.pointer()} bytes)`);
			resolve();
		});
		archive.on('error', reject);
		archive.pipe(output);
		archive.file(join(process.cwd(), 'dist/index.js'), { name: 'index.js' });
		archive.finalize();
	});

	const lambdaCode = readFileSync(zipPath);
	console.log(`✓ Loaded lambda bundle (${lambdaCode.length} bytes)`);

	// 2. Carica su S3
	const s3Key = `lambda/${LAMBDA_FUNCTION_NAME}-${Date.now()}.zip`;
	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: s3Key,
			Body: lambdaCode,
			ContentType: 'application/zip',
		})
	);
	console.log(`✓ Uploaded to S3: s3://${bucket}/${s3Key}`);

	// Cleanup
	unlinkSync(zipPath);

	// 3. Verifica se la funzione esiste
	let functionExists = false;
	try {
		await lambdaClient.send(
			new GetFunctionCommand({
				FunctionName: LAMBDA_FUNCTION_NAME,
			})
		);
		functionExists = true;
	} catch (e: any) {
		if (e.name !== 'ResourceNotFoundException') {
			throw e;
		}
	}

	if (!functionExists) {
		console.log('🆕 Creating new Lambda function...');
		await lambdaClient.send(
			new CreateFunctionCommand({
				FunctionName: LAMBDA_FUNCTION_NAME,
				Runtime: 'nodejs18.x',
				Role: roleArn,
				Handler: 'index.handler',
				Code: {
					S3Bucket: bucket,
					S3Key: s3Key,
				},
				Timeout: 300,
				MemorySize: 512,
				Environment: {
					Variables: {
						GROUP_KEY: groupKey,
						GROUP_SECRET: groupSecret,
						SECRETS_ENV: 'production',
						AWS_S3_BUCKET: bucket,
						// AWS_REGION è riservata e viene impostata automaticamente da AWS
					},
				},
			})
		);
		console.log(`✓ Created Lambda function: ${LAMBDA_FUNCTION_NAME}`);
		return;
	}

	// 4. Aggiorna il codice della funzione
	await lambdaClient.send(
		new UpdateFunctionCodeCommand({
			FunctionName: LAMBDA_FUNCTION_NAME,
			S3Bucket: bucket,
			S3Key: s3Key,
		})
	);
	console.log(`✓ Updated Lambda function code`);

	// Attendi che l'aggiornamento del codice sia completato
	console.log('⏳ Waiting for code update to complete...');
	let retries = 0;
	while (retries < 30) {
		try {
			const funcInfo = await lambdaClient.send(
				new GetFunctionCommand({
					FunctionName: LAMBDA_FUNCTION_NAME,
				})
			);
			if (funcInfo.Configuration?.LastUpdateStatus === 'Successful') {
				break;
			}
			if (funcInfo.Configuration?.LastUpdateStatus === 'Failed') {
				throw new Error('Lambda code update failed');
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
			retries++;
		} catch (e: any) {
			if (e.name === 'ResourceConflictException') {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				retries++;
				continue;
			}
			throw e;
		}
	}

	// 5. Aggiorna le variabili d'ambiente
	await lambdaClient.send(
		new UpdateFunctionConfigurationCommand({
			FunctionName: LAMBDA_FUNCTION_NAME,
			Environment: {
				Variables: {
					GROUP_KEY: groupKey,
					GROUP_SECRET: groupSecret,
					SECRETS_ENV: 'production',
					AWS_S3_BUCKET: bucket,
					// AWS_REGION è riservata e viene impostata automaticamente da AWS
				},
			},
		})
	);
	console.log(`✓ Updated Lambda environment variables`);
	console.log('✓ Lambda deployed successfully');
}

async function setupCronJobs(region: string, functionArn: string): Promise<void> {
	console.log('\n⏰ Setting up cron jobs...');

	const eventBridgeClient = new EventBridgeClient({ region });

	for (const poller of cronConfig.pollers) {
		const ruleName = `avacy-poller-${poller.name.replace(/[^a-zA-Z0-9-]/g, '-')}`;

		// Crea/aggiorna la regola
		await eventBridgeClient.send(
			new PutRuleCommand({
				Name: ruleName,
				ScheduleExpression: poller.schedule,
				State: 'ENABLED',
				Description: `Cron job for ${poller.name}`,
			})
		);
		console.log(`✓ Created/updated rule: ${ruleName}`);

		// Rimuovi target esistenti
		try {
			const existingTargets = await eventBridgeClient.send(
				new ListTargetsByRuleCommand({ Rule: ruleName })
			);
			if (existingTargets.Targets && existingTargets.Targets.length > 0) {
				await eventBridgeClient.send(
					new RemoveTargetsCommand({
						Rule: ruleName,
						Ids: existingTargets.Targets.map((t) => t.Id || '').filter(Boolean),
					})
				);
			}
		} catch (e) {
			// Ignora se non ci sono target
		}

		// Aggiungi permesso per EventBridge (se non esiste già)
		const lambdaClient = new LambdaClient({ region });
		const accountId = functionArn.split(':')[4];
		try {
			await lambdaClient.send(
				new AddPermissionCommand({
					FunctionName: functionArn.split(':function:')[1] || LAMBDA_FUNCTION_NAME,
					StatementId: `${ruleName}-invoke`,
					Action: 'lambda:InvokeFunction',
					Principal: 'events.amazonaws.com',
					SourceArn: `arn:aws:events:${region}:${accountId}:rule/${ruleName}`,
				})
			);
		} catch (e: any) {
			// Ignora se il permesso esiste già
			if (e.name !== 'ResourceConflictException') {
				// Ignora silenziosamente
			}
		}

		// Aggiungi nuovo target
		await eventBridgeClient.send(
			new PutTargetsCommand({
				Rule: ruleName,
				Targets: [
					{
						Id: '1',
						Arn: functionArn,
						Input: JSON.stringify({ poller: poller.name }),
					},
				],
			})
		);
		console.log(`✓ Added target for ${poller.name}`);
	}

	console.log('✅ Cron jobs configured');
}

async function loadSecrets() {
	const groupKey = process.env.GROUP_KEY;
	const groupSecret = process.env.GROUP_SECRET;
	const envName = process.env.SECRETS_ENV || 'production';

	if (!groupKey || !groupSecret) {
		console.warn('⚠️  GROUP_KEY or GROUP_SECRET missing. Using process.env only.');
		return {};
	}

	console.log('🔐 Loading secrets from @jumpgroup/secret-fetcher...');

	try {
		const secrets = await getSecrets({
			groupKey,
			groupSecret,
			env: envName,
		});

		const envSecrets = secrets[envName] || {};
		console.log(`✅ Loaded ${Object.keys(envSecrets).length} secrets`);
		return envSecrets;
	} catch (e) {
		console.warn('⚠️  Failed to load secrets:', e);
		return {};
	}
}

async function main() {
	// Carica secrets
	const secrets = await loadSecrets();
	const vars = { ...process.env, ...secrets } as Record<string, string>;

	const bucket = vars.AWS_S3_BUCKET;
	const region = vars.AWS_REGION || 'eu-central-1';
	const roleArn = vars.AWS_LAMBDA_ROLE_ARN;
	const groupKey = vars.GROUP_KEY;
	const groupSecret = vars.GROUP_SECRET;

	if (!bucket || !roleArn || !groupKey || !groupSecret) {
		console.error('❌ Missing required environment variables:');
		console.error('   - AWS_S3_BUCKET');
		console.error('   - AWS_LAMBDA_ROLE_ARN');
		console.error('   - GROUP_KEY');
		console.error('   - GROUP_SECRET');
		process.exit(1);
	}

	await deployLambda(bucket, region, roleArn, groupKey, groupSecret);

	// Ottieni ARN della funzione
	const lambdaClient = new LambdaClient({ region });
	const functionInfo = await lambdaClient.send(
		new GetFunctionCommand({
			FunctionName: LAMBDA_FUNCTION_NAME,
		})
	);

	const functionArn = functionInfo.Configuration?.FunctionArn;
	if (functionArn) {
		await setupCronJobs(region, functionArn);
	} else {
		console.log('⚠️  Could not get function ARN, skipping cron setup');
	}

	console.log('\n✅ Deployment complete!');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

