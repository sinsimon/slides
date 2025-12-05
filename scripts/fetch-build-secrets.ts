
import * as fs from 'fs';
import * as dotenv from 'dotenv';
// @ts-ignore
import { getSecrets } from '@jumpgroup/secret-fetcher';

dotenv.config();

async function main() {
    console.log('🚀 Fetching build secrets...');

    // Create dummy .secret-fetcher file to satisfy library requirement
    if (!fs.existsSync('.secret-fetcher')) {
        fs.writeFileSync('.secret-fetcher', '');
    }

    const groupKey = process.env.GROUP_KEY;
    const groupSecret = process.env.GROUP_SECRET;
    const envName = process.env.SECRETS_ENV || 'production';

    if (!groupKey || !groupSecret) {
        console.error('❌ Missing GROUP_KEY or GROUP_SECRET');
        process.exit(1);
    }

    try {
        const secrets = await getSecrets({
            groupKey,
            groupSecret,
            env: envName
        });

        const envSecrets = secrets[envName];
        if (!envSecrets) {
            console.error(`❌ No secrets found for env: ${envName}`);
            process.exit(1);
        }

        console.log(`✅ Secrets fetched for ${envName}. Injecting into GITHUB_ENV...`);

        // List of keys we expect to be available for the build/deploy process
        const KEYS_TO_EXPORT = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_REGION',
            'AWS_S3_BUCKET',
            'AWS_LAMBDA_ROLE_ARN',
            // 'CLOUDFRONT_DISTRIBUTION_ID' // Optional
        ];

        const githubEnvFile = process.env.GITHUB_ENV;
        if (!githubEnvFile) {
            console.warn('⚠️  GITHUB_ENV not defined. Printing keys for debug (masked)...');
        }

        let exportedCount = 0;
        for (const key of KEYS_TO_EXPORT) {
            const val = envSecrets[key];
            if (val) {
                if (githubEnvFile) {
                    fs.appendFileSync(githubEnvFile, `${key}=${val}\n`);
                }
                console.log(`   -> Exported ${key}`);
                exportedCount++;
            } else {
                console.warn(`   ⚠️  Missing ${key} in secrets!`);
            }
        }

        // Handle optional CloudFront ID separately without warning if missing
        const cfId = envSecrets['CLOUDFRONT_DISTRIBUTION_ID'];
        if (cfId) {
            if (githubEnvFile) {
                fs.appendFileSync(githubEnvFile, `CLOUDFRONT_DISTRIBUTION_ID=${cfId}\n`);
            }
            console.log(`   -> Exported CLOUDFRONT_DISTRIBUTION_ID`);
        }

        if (exportedCount === 0) {
            console.error('❌ No relevant AWS keys found in secrets!');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Error fetching secrets:', err);
        process.exit(1);
    }
}

main();


