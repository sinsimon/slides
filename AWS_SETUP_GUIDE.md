# Guida Setup AWS - Console UI

Questa guida ti porta passo-passo nella configurazione di AWS tramite la console web.

---

## 📋 Prerequisiti

- Account AWS attivo
- Accesso alla console AWS
- Permessi per creare risorse (S3, Lambda, IAM, EventBridge)

---

## 1️⃣ Creare il Bucket S3

### Step 1.1: Apri S3 Console

1. Vai su [AWS Console](https://console.aws.amazon.com)
2. Cerca "S3" nella barra di ricerca
3. Clicca su **S3** → **Buckets**

### Step 1.2: Crea il Bucket

1. Clicca **Create bucket**
2. **General configuration:**
   - **Bucket name**: `avacy-slides` (o il nome che preferisci, deve essere unico globalmente)
   - **AWS Region**: `Europe (Frankfurt) eu-central-1` (o la regione che preferisci)
3. **Object Ownership:**
   - Lascia **ACLs disabled** (consigliato) o **ACLs enabled** se vuoi controlli granulari
4. **Block Public Access settings:**
   - **Per il frontend**: Deseleziona "Block all public access" (il frontend deve essere pubblico)
   - **Oppure**: Lascia bloccato e usa CloudFront (più sicuro)
5. **Bucket Versioning**: Opzionale, lascia disabilitato per iniziare
6. **Default encryption**: Consigliato, lascia **SSE-S3** (gratuito)
7. Clicca **Create bucket**

### Step 1.3: Configura Permessi Pubblici (se necessario)

1. Vai nel bucket appena creato
2. Tab **Permissions**
3. **Block public access**: Se hai deselezionato prima, qui puoi vedere le impostazioni
4. **Bucket policy** (se vuoi rendere pubblico solo il frontend):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::avacy-slides/*"
       }
     ]
   }
   ```
   Sostituisci `avacy-slides` con il nome del tuo bucket.

### Step 1.4: Abilita Static Website Hosting (opzionale, se non usi CloudFront)

1. Tab **Properties**
2. Scorri fino a **Static website hosting**
3. Clicca **Edit**
4. **Enable**: Sì
5. **Index document**: `index.html`
6. **Error document**: `index.html` (per SPA)
7. **Save changes**
8. Annota l'**Endpoint URL** (es: `http://avacy-slides.s3-website.eu-central-1.amazonaws.com`)

---

## 2️⃣ Creare il Ruolo IAM per Lambda

### Step 2.1: Apri IAM Console

1. Cerca "IAM" nella barra di ricerca
2. Clicca su **IAM** → **Roles**

### Step 2.2: Crea il Ruolo

1. Clicca **Create role**
2. **Trusted entity type**: Seleziona **AWS service**
3. **Use case**: Seleziona **Lambda**
4. Clicca **Next**

### Step 2.3: Aggiungi Permessi

1. Cerca e seleziona queste policy:
   - **AmazonS3FullAccess** (o crea una policy custom più restrittiva)
   - **CloudWatchLogsFullAccess** (per i log delle Lambda)
2. Clicca **Next**

### Step 2.4: Nome e Descrizione

1. **Role name**: `avacy-poller-lambda-role`
2. **Description**: `Role for Avacy poller Lambda functions to access S3`
3. Clicca **Create role**

### Step 2.5: Annota l'ARN

1. Dopo la creazione, clicca sul ruolo
2. Copia l'**ARN** (es: `arn:aws:iam::123456789012:role/avacy-poller-lambda-role`)
3. **Ti servirà per il secret GitHub**: `AWS_LAMBDA_ROLE_ARN`

### Step 2.6: (Opzionale) Crea Policy Custom più Restrittiva

Se vuoi essere più sicuro invece di `AmazonS3FullAccess`:

1. Vai su **IAM** → **Policies** → **Create policy**
2. Tab **JSON**, incolla:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::avacy-slides", "arn:aws:s3:::avacy-slides/*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

3. **Name**: `avacy-poller-s3-access`
4. Clicca **Create policy**
5. Torna al ruolo e **Attach policies** → seleziona la policy appena creata

---

## 3️⃣ Configurare CloudFront (Opzionale ma Consigliato)

### Step 3.1: Apri CloudFront Console

1. Cerca "CloudFront" nella barra di ricerca
2. Clicca su **CloudFront** → **Distributions**

### Step 3.2: Crea Distribuzione

1. Clicca **Create distribution**
2. **Origin domain**: Seleziona il tuo bucket S3 (es: `avacy-slides.s3.eu-central-1.amazonaws.com`)
3. **Origin access**:
   - **Origin access control settings (recommended)**: Seleziona
   - Clicca **Create control setting**
     - **Name**: `avacy-slides-oac`
     - **Signing behavior**: `Sign requests`
     - **Origin type**: `S3`
     - Clicca **Create**
   - Seleziona il control setting appena creato
4. **Default cache behavior**:
   - **Viewer protocol policy**: `Redirect HTTP to HTTPS`
   - **Allowed HTTP methods**: `GET, HEAD, OPTIONS`
   - **Cache policy**: `CachingOptimized` (o `CachingDisabled` per sviluppo)
5. **Settings**:
   - **Price class**: `Use only North America and Europe` (più economico)
   - **Alternate domain names (CNAMEs)**: Opzionale, se hai un dominio
   - **Default root object**: `index.html`
6. Clicca **Create distribution**
7. **Annota il Distribution ID** (es: `E1234567890ABC`) - ti servirà per GitHub secrets

### Step 3.3: Aggiorna Bucket Policy per CloudFront

1. Vai su S3 → il tuo bucket → **Permissions**
2. **Bucket policy** → **Edit**
3. Incolla questa policy (sostituisci `DISTRIBUTION_ID` e `BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

4. Sostituisci:
   - `BUCKET_NAME` con il nome del tuo bucket
   - `ACCOUNT_ID` con il tuo Account ID AWS (lo trovi in alto a destra nella console)
   - `DISTRIBUTION_ID` con l'ID della distribuzione CloudFront
5. **Save changes**

---

## 4️⃣ Configurare i Secrets su GitHub

### Step 4.1: Apri GitHub Repository

1. Vai sul tuo repository GitHub
2. **Settings** → **Secrets and variables** → **Actions**

### Step 4.2: Aggiungi i Secrets

Clicca **New repository secret** per ognuno:

1. **AWS_ACCESS_KEY_ID**

   - **Name**: `AWS_ACCESS_KEY_ID`
   - **Secret**: La tua Access Key ID AWS
   - Come ottenerla: IAM → Users → il tuo utente → Security credentials → Create access key

2. **AWS_SECRET_ACCESS_KEY**

   - **Name**: `AWS_SECRET_ACCESS_KEY`
   - **Secret**: La tua Secret Access Key AWS (mostrata solo una volta!)

3. **AWS_REGION**

   - **Name**: `AWS_REGION`
   - **Secret**: `eu-central-1` (o la regione che hai scelto)

4. **AWS_S3_BUCKET**

   - **Name**: `AWS_S3_BUCKET`
   - **Secret**: `avacy-slides` (o il nome del tuo bucket)

5. **AWS_LAMBDA_ROLE_ARN**

   - **Name**: `AWS_LAMBDA_ROLE_ARN`
   - **Secret**: L'ARN del ruolo che hai creato (es: `arn:aws:iam::123456789012:role/avacy-poller-lambda-role`)

6. **CLOUDFRONT_DISTRIBUTION_ID** (opzionale, solo se hai creato CloudFront)
   - **Name**: `CLOUDFRONT_DISTRIBUTION_ID`
   - **Secret**: L'ID della distribuzione CloudFront (es: `E1234567890ABC`)

### Step 4.3: Creare Access Key per GitHub Actions

Se non hai già un access key:

1. Vai su **IAM** → **Users**
2. Seleziona il tuo utente (o creane uno dedicato per CI/CD)
3. Tab **Security credentials**
4. **Access keys** → **Create access key**
5. **Use case**: **Command Line Interface (CLI)**
6. Clicca **Next** → **Create access key**
7. **IMPORTANTE**: Copia subito sia **Access key ID** che **Secret access key** (questa non la vedrai più!)
8. Usa questi valori per i secrets GitHub

---

## 5️⃣ (Opzionale) Configurare Variabili d'Ambiente per le Lambda

Le Lambda avranno bisogno delle variabili d'ambiente per le API esterne. Puoi configurarle dopo il primo deploy, oppure:

### Opzione A: Configurare dopo il deploy (consigliato)

Le variabili d'ambiente verranno aggiunte automaticamente dallo script di deploy.

### Opzione B: Configurare manualmente

1. Dopo il primo deploy, vai su **Lambda** → **Functions**
2. Seleziona una funzione (es: `stripe-new-subscriptions`)
3. Tab **Configuration** → **Environment variables**
4. **Edit** → **Add environment variable** per ogni:
   - `STRIPE_API_KEY`
   - `MONDAY_API_KEY`
   - `MONDAY_BOARD_ID`
   - `ACTIVE_CAMPAIGN_API_URL`
   - `ACTIVE_CAMPAIGN_API_KEY`
   - `VAPOR_RDS_HOST`
   - `VAPOR_RDS_PORT`
   - `VAPOR_RDS_USER`
   - `VAPOR_RDS_PASSWORD`
   - `VAPOR_RDS_DATABASE`
   - `VAPOR_RDS_SSL`
   - `VAPOR_RDS_SSL_REJECT_UNAUTHORIZED`
   - `AWS_S3_BUCKET` (già impostato dallo script)
5. **Save**

**Nota**: Dovrai farlo per ogni Lambda function. Meglio usare AWS Systems Manager Parameter Store o Secrets Manager per gestirle centralmente (avanzato).

---

## 6️⃣ Verificare il Deploy

### Step 6.1: Trigger GitHub Action

1. Fai push su `master` o `main`
2. Vai su GitHub → **Actions**
3. Verifica che il workflow **Deploy to AWS** parta

### Step 6.2: Verificare S3

1. Vai su S3 → il tuo bucket
2. Dovresti vedere i file del frontend in root
3. Dopo il primo run dei poller, vedrai `data/avacy/json/` con i JSON

### Step 6.3: Verificare Lambda

1. Vai su **Lambda** → **Functions**
2. Dovresti vedere 6 funzioni (una per ogni poller):
   - `stripe-new-subscriptions`
   - `stripe-cancellations`
   - `monday-enterprise-accounts`
   - `active-campaign-contacts`
   - `vapor-tenants`
   - `vapor-users-funnel`

### Step 6.4: Verificare EventBridge

1. Vai su **EventBridge** → **Rules**
2. Dovresti vedere 6 regole (una per ogni poller):
   - `stripe-new-subscriptions-schedule`
   - `stripe-cancellations-schedule`
   - etc.
3. Ogni regola dovrebbe avere schedule: `cron(0 3 * * ? *)` (03:00 UTC ogni giorno)

### Step 6.5: Test Manuale Lambda

1. Vai su **Lambda** → **Functions** → seleziona una funzione
2. Tab **Test**
3. **Create new test event**:
   ```json
   {
     "poller": "stripe:new-subscriptions"
   }
   ```
4. **Save** → **Test**
5. Verifica i log in **Monitor** → **View CloudWatch logs**

---

## ✅ Checklist Finale

- [ ] Bucket S3 creato e configurato
- [ ] Ruolo IAM per Lambda creato con permessi S3
- [ ] CloudFront distribuzione creata (opzionale)
- [ ] Tutti i secrets configurati su GitHub
- [ ] GitHub Action eseguita con successo
- [ ] Lambda functions deployate
- [ ] EventBridge rules configurate
- [ ] Test manuale Lambda eseguito
- [ ] Frontend accessibile (S3 o CloudFront URL)
- [ ] JSON accessibili dal frontend

---

## 🐛 Troubleshooting

### Lambda timeout

- Vai su Lambda → Function → **Configuration** → **General configuration** → **Edit**
- Aumenta **Timeout** a 15 minuti (900 secondi)

### Lambda non può scrivere su S3

- Verifica che il ruolo IAM abbia i permessi S3
- Controlla che `AWS_S3_BUCKET` sia impostato nelle variabili d'ambiente

### EventBridge non invoca Lambda

- Verifica che la regola EventBridge esista
- Controlla che il target sia configurato correttamente
- Verifica i permessi: Lambda deve permettere a EventBridge di invocarla

### Frontend non accessibile

- Se usi S3 diretto: verifica che il bucket abbia permessi pubblici
- Se usi CloudFront: attendi 5-10 minuti per la propagazione
- Verifica che `index.html` sia presente nel bucket

---

## 📝 Note Importanti

- **Costi**: S3, Lambda e CloudFront hanno costi bassi per uso moderato, ma monitora sempre
- **Sicurezza**: Non committare mai le credenziali AWS nel codice
- **Backup**: I JSON su S3 sono versionati se hai abilitato versioning
- **Monitoring**: Usa CloudWatch per monitorare le esecuzioni delle Lambda

---

Buon deploy! 🚀
