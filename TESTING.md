# Guida al Testing del Deploy AWS

Questa guida ti aiuta a testare passo per passo il sistema di deploy su AWS.

## 🎯 Strategia di Test

Testiamo in ordine crescente di complessità:

1. **Locale** - Verifica che i poller funzionino ancora localmente
2. **S3** - Verifica che i poller salvino correttamente su S3
3. **Lambda Locale** - Test del handler Lambda in locale
4. **AWS Staging** - Deploy su AWS e test reale

---

## 1️⃣ Test Locale (Compatibilità)

Verifica che i poller funzionino ancora come prima, salvando su filesystem.

```bash
npm run test:poller:local
```

**Cosa verifica:**

- ✅ I poller eseguono senza errori
- ✅ I file JSON vengono salvati in `src/data/avacy/json/`
- ✅ La compatibilità locale è mantenuta

**Se fallisce:** Controlla le variabili d'ambiente e le credenziali API.

---

## 2️⃣ Test S3 (Simulazione Lambda)

Simula l'ambiente Lambda per verificare che i file vengano salvati su S3.

**Prerequisiti:**

- AWS CLI configurato con credenziali valide
- Bucket S3 esistente
- Variabile `AWS_S3_BUCKET` nel `.env` o come env var

```bash
# Imposta il bucket (se non è già nel .env)
export AWS_S3_BUCKET=tuo-bucket-name
export AWS_REGION=eu-central-1

# Esegui il test
npm run test:poller:s3
```

**Cosa verifica:**

- ✅ La funzione `saveJsonFile` rileva correttamente l'ambiente Lambda
- ✅ I file vengono caricati su S3
- ✅ I file sono accessibili su S3

**Se fallisce:**

- Verifica le credenziali AWS: `aws sts get-caller-identity`
- Verifica i permessi sul bucket S3
- Controlla che `AWS_S3_BUCKET` sia impostato correttamente

---

## 3️⃣ Test Lambda Handler Locale

Testa il Lambda handler simulando un evento Lambda.

```bash
# Assicurati di avere AWS_S3_BUCKET impostato
export AWS_S3_BUCKET=tuo-bucket-name

npm run test:lambda:handler
```

**Cosa verifica:**

- ✅ Il handler Lambda riceve correttamente gli eventi
- ✅ I poller vengono eseguiti correttamente dal handler
- ✅ Gli errori vengono gestiti correttamente

**Nota:** Questo test eseguirà realmente i poller, quindi assicurati di avere:

- Credenziali API valide (Stripe, Monday, ActiveCampaign, Vapor RDS)
- Connessione internet
- Permessi S3 per scrivere

---

## 4️⃣ Test Manuale di un Poller

Puoi testare un singolo poller manualmente:

```bash
# Test locale (salva su filesystem)
npm run poll -- stripe:new-subscriptions

# Test con simulazione Lambda (salva su S3)
AWS_LAMBDA_FUNCTION_NAME=test-function AWS_S3_BUCKET=tuo-bucket npm run poll -- stripe:new-subscriptions
```

---

## 5️⃣ Test su AWS (Staging)

### Prerequisiti

1. **Crea il bucket S3:**

```bash
aws s3 mb s3://tuo-bucket-name --region eu-central-1
```

2. **Crea il ruolo IAM per Lambda:**

```bash
# Crea un file trust-policy.json
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Crea il ruolo
aws iam create-role \
  --role-name avacy-poller-lambda-role \
  --assume-role-policy-document file://trust-policy.json

# Crea e attacca policy per S3
aws iam attach-role-policy \
  --role-name avacy-poller-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Crea e attacca policy per CloudWatch Logs
aws iam attach-role-policy \
  --role-name avacy-poller-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Ottieni l'ARN del ruolo
aws iam get-role --role-name avacy-poller-lambda-role --query 'Role.Arn' --output text
```

3. **Configura i secrets su GitHub:**
   - Vai su GitHub → Settings → Secrets and variables → Actions
   - Aggiungi:
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `AWS_REGION` (es: `eu-central-1`)
     - `AWS_S3_BUCKET` (es: `tuo-bucket-name`)
     - `AWS_LAMBDA_ROLE_ARN` (l'ARN ottenuto sopra)
     - `CLOUDFRONT_DISTRIBUTION_ID` (opzionale)

### Deploy Manuale

Prima di usare GitHub Actions, puoi testare manualmente:

```bash
# Installa dipendenze
npm ci

# Deploy frontend
npm run build
aws s3 sync ./dist s3://tuo-bucket-name --delete --acl public-read --exclude "data/*"

# Deploy Lambda (richiede le variabili d'ambiente)
export AWS_S3_BUCKET=tuo-bucket-name
export AWS_LAMBDA_ROLE_ARN=arn:aws:iam::123456789012:role/avacy-poller-lambda-role
./scripts/deploy-lambdas.sh
```

### Test Lambda su AWS

Dopo il deploy, testa una Lambda manualmente:

```bash
# Invoca una Lambda manualmente
aws lambda invoke \
  --function-name stripe-new-subscriptions \
  --payload '{"poller":"stripe:new-subscriptions"}' \
  --region eu-central-1 \
  response.json

cat response.json
```

### Verifica EventBridge

Controlla che le regole EventBridge siano configurate:

```bash
# Lista tutte le regole
aws events list-rules --region eu-central-1

# Verifica una regola specifica
aws events describe-rule --name stripe-new-subscriptions-schedule --region eu-central-1

# Verifica i target di una regola
aws events list-targets-by-rule --rule stripe-new-subscriptions-schedule --region eu-central-1
```

---

## 6️⃣ Test Frontend

Dopo il deploy del frontend:

1. **Verifica che il sito sia accessibile:**

   - Se hai CloudFront: `https://tuo-distribution.cloudfront.net`
   - Se solo S3: `http://tuo-bucket-name.s3-website.eu-central-1.amazonaws.com`

2. **Verifica che i JSON siano accessibili:**
   - Controlla che i file in `data/avacy/json/` siano serviti correttamente
   - Il frontend dovrebbe leggerli da S3/CloudFront

---

## 🐛 Troubleshooting

### Poller non salvano su S3

- Verifica che `AWS_LAMBDA_FUNCTION_NAME` sia impostato (automatico su Lambda)
- Verifica che `AWS_S3_BUCKET` sia impostato
- Controlla i permessi IAM del ruolo Lambda

### Lambda timeout

- Aumenta il timeout in `scripts/deploy-lambdas.sh` (attualmente 900s = 15min)
- Controlla i log CloudWatch per vedere dove si blocca

### EventBridge non invoca Lambda

- Verifica che la regola EventBridge esista
- Verifica che il target sia configurato correttamente
- Controlla i permessi: Lambda deve permettere a EventBridge di invocarla

### Frontend non carica i JSON

- Verifica che i JSON siano stati copiati in `dist/data/avacy/json/` durante il build
- Verifica i permessi S3 (deve essere pubblico-read per i JSON)
- Se usi CloudFront, verifica che la distribuzione includa i path `/data/*`

---

## ✅ Checklist Pre-Produzione

Prima di andare in produzione, verifica:

- [ ] Tutti i test locali passano
- [ ] Test S3 passa
- [ ] Lambda deployate correttamente
- [ ] EventBridge rules configurate
- [ ] Frontend deployato e accessibile
- [ ] JSON accessibili dal frontend
- [ ] Log CloudWatch verificati
- [ ] Credenziali API valide nelle Lambda (variabili d'ambiente)
- [ ] Backup/rollback plan pronto

---

## 📝 Note

- I poller mantengono **piena compatibilità locale**: funzionano esattamente come prima quando eseguiti localmente
- Le Lambda vengono eseguite alle **03:00 UTC** ogni giorno (configurabile in `lambda-cron-config.json`)
- I JSON vengono salvati in `s3://bucket/data/avacy/json/<source>/<file>.json`
- Il frontend legge i JSON da S3/CloudFront in produzione
