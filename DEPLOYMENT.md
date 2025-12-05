# Deployment e Sviluppo - Documentazione

Questa documentazione spiega come funziona il sistema di deployment, i comandi locali disponibili e le GitHub Actions per il progetto slides.

## 📋 Indice

- [Architettura Generale](#architettura-generale)
- [Pollers](#pollers)
- [Comandi Locali](#comandi-locali)
- [Deployment Lambda](#deployment-lambda)
- [GitHub Actions](#github-actions)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architettura Generale

Il progetto è composto da:

1. **Frontend React/Vite**: Dashboard per visualizzare i dati
2. **Pollers**: Funzioni che raccolgono dati da varie sorgenti (Stripe, Monday, ActiveCampaign, Vapor RDS)
3. **AWS Lambda**: Esegue i pollers automaticamente ogni giorno
4. **AWS S3**: Storage per i JSON generati dai pollers e per il frontend
5. **AWS EventBridge**: Schedula l'esecuzione giornaliera dei pollers

### Flusso Dati

```
Pollers (Lambda) → JSON su S3 → Frontend (legge da S3/CloudFront)
```

I pollers vengono eseguiti ogni giorno alle **3:00 UTC** e aggiornano i JSON su S3. Il frontend legge questi JSON direttamente da S3/CloudFront.

---

## 🔄 Pollers

I pollers sono funzioni pure indipendenti che:

- Accettano un oggetto di variabili come parametro
- Ritornano JSON direttamente (non salvano file)
- Non accedono direttamente a `process.env` o salvano file

### Pollers Disponibili

- `stripe:new-subscriptions` - Nuove sottoscrizioni Stripe
- `stripe:cancellations` - Cancellazioni Stripe
- `monday:enterprise-accounts` - Account enterprise da Monday
- `active-campaign:contacts` - Contatti da ActiveCampaign
- `vapor:tenants` - Tenant dal database Vapor
- `vapor:users-funnel` - Funnel utenti dal database Vapor
- `vapor:leaderboard` - Leaderboard dal database Vapor

### Struttura Pollers

Ogni poller è una funzione pura:

```typescript
export async function fetchPollerName(vars: PollerVars): Promise<ReturnType> {
  // Logica del poller
  return data;
}
```

I pollers sono in `src/data/avacy/pollers/` e vengono eseguiti da:

- **Locale**: `run.ts` - salva JSON in `src/data/avacy/json/`
- **Lambda**: `lambda-handler.ts` - salva JSON su S3

---

## 💻 Comandi Locali

### Eseguire Pollers Localmente

```bash
# Esegui un singolo poller
npm run poll -- <poller-name>

# Esempi:
npm run poll -- stripe:new-subscriptions
npm run poll -- vapor:tenants

# Esegui tutti i pollers
npm run poll:all
```

I JSON vengono salvati in `src/data/avacy/json/<source>/<file>.json`

### Build e Deploy Lambda

```bash
# Build della Lambda (compila TypeScript → JavaScript)
npm run lambda:build

# Deploy della Lambda su AWS
npm run lambda:deploy
```

Il deploy:

1. Crea un ZIP del bundle
2. Carica su S3
3. Aggiorna/crea la funzione Lambda
4. Configura le variabili d'ambiente
5. Configura i cron jobs su EventBridge

### Altri Comandi Utili

```bash
# Build frontend
npm run build

# Dev server locale
npm run dev

# Preview build locale
npm run preview
```

---

## 🚀 Deployment Lambda

### Processo di Deployment

Il deployment Lambda avviene tramite `scripts/deploy-lambda.ts`:

1. **Carica secrets** da `@jumpgroup/secret-fetcher` usando `GROUP_KEY` e `GROUP_SECRET`
2. **Crea ZIP** del bundle compilato (`dist/index.js`)
3. **Upload su S3** in `s3://<bucket>/lambda/<function-name>-<timestamp>.zip`
4. **Crea/aggiorna Lambda** funzione `avacy-pollers`
5. **Configura variabili d'ambiente**:
   - `GROUP_KEY`
   - `GROUP_SECRET`
   - `SECRETS_ENV=production`
   - `AWS_S3_BUCKET`
6. **Configura cron jobs** da `lambda-cron-config.json`

### Variabili d'Ambiente Richieste

Per il deployment locale, servono:

- `AWS_S3_BUCKET` - Bucket S3 per i JSON e Lambda
- `AWS_LAMBDA_ROLE_ARN` - ARN del ruolo IAM per Lambda
- `AWS_REGION` - Regione AWS (default: `eu-central-1`)
- `GROUP_KEY` - Chiave per secret-fetcher
- `GROUP_SECRET` - Secret per secret-fetcher
- `SECRETS_ENV` - Ambiente secrets (default: `production`)

### Configurazione Cron

I cron jobs sono configurati in `lambda-cron-config.json`:

```json
{
  "pollers": [
    { "name": "stripe:new-subscriptions", "schedule": "cron(0 3 * * ? *)" },
    ...
  ]
}
```

Tutti i pollers sono schedulati per eseguirsi alle **3:00 UTC** ogni giorno.

### Test Lambda Locale

```bash
# Invoca Lambda manualmente
node -e "
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const client = new LambdaClient({ region: 'eu-central-1' });
client.send(new InvokeCommand({
  FunctionName: 'avacy-pollers',
  Payload: JSON.stringify({ poller: 'stripe:new-subscriptions' })
})).then(result => {
  const response = JSON.parse(Buffer.from(result.Payload).toString());
  console.log(response);
});
"
```

---

## 🔧 GitHub Actions

### Workflow: `.github/workflows/deploy.yml`

Il workflow si attiva su push a `main` o `master` quando ci sono modifiche a:

- `src/**`
- `scripts/**`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `lambda-cron-config.json`
- `.github/workflows/deploy.yml`

### Jobs

#### 1. `deploy-frontend`

Deploy del frontend React su S3:

1. Checkout codice
2. Setup Node.js 18
3. Install dependencies (`npm ci`)
4. Fetch build secrets (carica variabili d'ambiente)
5. Configure AWS credentials
6. Build frontend (`npm run build`)
7. Deploy to S3 (`aws s3 sync ./dist s3://<bucket> --delete --exclude "data/*"`)
8. Invalidate CloudFront (se configurato)

**Nota**: I JSON in `data/*` vengono **esclusi** dal deploy perché vengono aggiornati solo dalla Lambda.

#### 2. `deploy-lambdas`

Deploy della Lambda function:

1. Checkout codice
2. Setup Node.js 18
3. Install dependencies (`npm ci`)
4. Fetch build secrets
5. Configure AWS credentials
6. Build Lambda (`npm run lambda:build`)
7. Deploy Lambda (`npm run lambda:deploy`)

### Secrets GitHub Richiesti

- `GROUP_KEY` - Chiave per secret-fetcher
- `GROUP_SECRET` - Secret per secret-fetcher

### Environment Variables (da secrets)

Le variabili d'ambiente vengono caricate da `scripts/fetch-build-secrets.ts` che usa `@jumpgroup/secret-fetcher`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_LAMBDA_ROLE_ARN`
- `CLOUDFRONT_DISTRIBUTION_ID` (opzionale)

---

## 🐛 Troubleshooting

### Pollers non aggiornano JSON su S3

1. Verifica che la Lambda sia stata deployata:

   ```bash
   aws lambda get-function --function-name avacy-pollers --region eu-central-1
   ```

2. Controlla i log CloudWatch:

   ```bash
   aws logs tail /aws/lambda/avacy-pollers --since 1h --region eu-central-1
   ```

3. Invoca manualmente la Lambda per testare:
   ```bash
   # Usa il comando di test sopra
   ```

### Frontend non mostra dati aggiornati

1. **Cache del browser**: Il frontend usa cache-busting giornaliero (`?d=YYYY-MM-DD`), quindi i dati vengono ricaricati una volta al giorno
2. **Verifica JSON su S3**:
   ```bash
   aws s3 ls s3://<bucket>/data/avacy/json/ --recursive --human-readable
   ```
3. **Verifica timestamp**:
   ```bash
   aws s3api head-object --bucket <bucket> --key data/avacy/json/vapor/tenants.json --query 'LastModified'
   ```

### Lambda deployment fallisce

1. Verifica variabili d'ambiente:

   ```bash
   echo $AWS_S3_BUCKET
   echo $AWS_LAMBDA_ROLE_ARN
   echo $GROUP_KEY
   echo $GROUP_SECRET
   ```

2. Verifica permessi IAM:

   - Lambda deve poter scrivere su S3
   - Lambda deve poter creare/aggiornare EventBridge rules
   - Utente deve poter deployare Lambda

3. Controlla errori nel log:
   ```bash
   npm run lambda:deploy 2>&1 | tee deploy.log
   ```

### Cron jobs non si attivano

1. Verifica regole EventBridge:

   ```bash
   aws events list-rules --name-prefix "avacy-poller" --region eu-central-1
   ```

2. Verifica target associati:

   ```bash
   aws events list-targets-by-rule --rule "avacy-poller-stripe-new-subscriptions" --region eu-central-1
   ```

3. Verifica permessi Lambda per EventBridge:
   - Lambda deve avere permission policy che permette a `events.amazonaws.com` di invocarla

### JSON non sincronizzati tra locale e S3

I JSON locali (`src/data/avacy/json/`) e quelli su S3 possono differire:

- **Locale**: Aggiornati manualmente con `npm run poll`
- **S3**: Aggiornati automaticamente dalla Lambda ogni giorno alle 3:00 UTC

Per sincronizzare:

```bash
# Esegui tutti i pollers localmente
npm run poll:all

# Oppure invoca la Lambda per aggiornare S3
# (usa il comando di test sopra)
```

---

## 📝 Note Importanti

1. **I JSON su S3 sono la fonte di verità** per il frontend in produzione
2. **I JSON locali** sono solo per sviluppo/test
3. **Il deploy del frontend esclude `data/*`** per non sovrascrivere i JSON aggiornati dalla Lambda
4. **Cache-busting giornaliero**: Il frontend ricarica i JSON una volta al giorno usando `?d=YYYY-MM-DD`
5. **Secrets**: Tutti i secrets vengono caricati da `@jumpgroup/secret-fetcher` usando `GROUP_KEY` e `GROUP_SECRET`
6. **Cron jobs**: Tutti i pollers vengono eseguiti alle 3:00 UTC ogni giorno

---

## 🔗 File Chiave

- `src/data/avacy/pollers/run.ts` - Runner locale
- `src/data/avacy/pollers/lambda-handler.ts` - Handler Lambda
- `scripts/build-lambda.ts` - Build Lambda
- `scripts/deploy-lambda.ts` - Deploy Lambda
- `lambda-cron-config.json` - Configurazione cron jobs
- `.github/workflows/deploy.yml` - GitHub Actions workflow
- `src/data/avacy/utils/assets.ts` - Helper per fetch con cache-busting

---

## ✅ Checklist Pre-Deploy

Prima di fare deploy, verifica:

- [ ] Tutti i test locali passano
- [ ] Pollers funzionano localmente (`npm run poll:all`)
- [ ] Build Lambda funziona (`npm run lambda:build`)
- [ ] Deploy Lambda funziona (`npm run lambda:deploy`)
- [ ] Variabili d'ambiente configurate
- [ ] Secrets GitHub configurati
- [ ] JSON su S3 aggiornati (verifica timestamp)
- [ ] Frontend legge correttamente i JSON (test locale)

---

**Ultimo aggiornamento**: Dicembre 2024

