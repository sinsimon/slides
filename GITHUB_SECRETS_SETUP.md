# Setup GitHub Secrets

Configura questi secrets nel tuo repository GitHub per abilitare il deploy automatico.

## 📍 Dove andare

1. Vai sul tuo repository GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Clicca **New repository secret** per ogni secret

## 🔑 Secrets da Configurare

### 1. AWS_ACCESS_KEY_ID
- **Name**: `AWS_ACCESS_KEY_ID`
- **Secret**: La tua AWS Access Key ID (inizia con `AKIA...`)

### 2. AWS_SECRET_ACCESS_KEY
- **Name**: `AWS_SECRET_ACCESS_KEY`
- **Secret**: La tua AWS Secret Access Key

### 3. AWS_REGION
- **Name**: `AWS_REGION`
- **Secret**: `eu-central-1` (o la regione che hai scelto)

### 4. AWS_S3_BUCKET
- **Name**: `AWS_S3_BUCKET`
- **Secret**: `simo-slides` (o il nome del tuo bucket)

### 5. AWS_LAMBDA_ROLE_ARN
- **Name**: `AWS_LAMBDA_ROLE_ARN`
- **Secret**: L'ARN del ruolo IAM per Lambda (es: `arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME`)

### 6. CLOUDFRONT_DISTRIBUTION_ID (Opzionale)
- **Name**: `CLOUDFRONT_DISTRIBUTION_ID`
- **Secret**: (lascia vuoto per ora, lo aggiungerai dopo se configuri CloudFront)

## ✅ Verifica

Dopo aver configurato tutti i secrets, fai un push su `master` o `main` e verifica che la GitHub Action parta correttamente.

Vai su: **GitHub** → **Actions** → dovresti vedere il workflow "Deploy to AWS" in esecuzione.
