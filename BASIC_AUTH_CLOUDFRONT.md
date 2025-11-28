# Basic Auth con CloudFront

## Risposta breve

**Sì, CloudFront è necessario per implementare Basic Auth** su S3. S3 da solo non supporta autenticazione HTTP Basic.

## Come funziona

CloudFront supporta Basic Auth tramite **Lambda@Edge** o **CloudFront Functions** (più semplice e economico).

## Opzione 1: CloudFront Functions (Consigliato - Gratuito)

### Step 1: Crea CloudFront Distribution

1. Vai su **CloudFront** → **Distributions** → **Create distribution**
2. **Origin domain**: `simo-slides.s3.eu-central-1.amazonaws.com`
3. **Origin access**: **Origin access control settings (recommended)**
   - Clicca **Create control setting**
   - **Name**: `simo-slides-oac`
   - **Signing behavior**: `Sign requests`
   - Clicca **Create**
4. **Default cache behavior**: Lascia default
5. **Settings**:
   - **Default root object**: `index.html`
6. Clicca **Create distribution**
7. Annota il **Distribution ID**

### Step 2: Crea CloudFront Function per Basic Auth

1. Vai su **CloudFront** → **Functions** → **Create function**
2. **Function name**: `simo-slides-basic-auth`
3. **Function code**: Incolla questo codice:

```javascript
function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Credenziali (cambiale!)
  var username = "admin";
  var password = "tua-password-sicura";

  // Crea la stringa base64
  var authString = username + ":" + password;
  var expectedAuth = "Basic " + authString.toString("base64");

  // Verifica l'header Authorization
  if (
    typeof headers.authorization === "undefined" ||
    headers.authorization.value !== expectedAuth
  ) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": { value: "Basic" },
      },
    };
  }

  // Autenticazione OK, procedi con la richiesta
  return request;
}
```

**Nota**: Il codice sopra è semplificato. Per una versione completa con base64 encoding, usa:

```javascript
function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Credenziali (cambiale!)
  var username = "admin";
  var password = "tua-password-sicura";

  // Base64 encoding (CloudFront Functions supporta btoa)
  var credentials = username + ":" + password;
  var encoded = btoa(credentials);
  var expectedAuth = "Basic " + encoded;

  // Verifica l'header Authorization
  if (!headers.authorization || headers.authorization.value !== expectedAuth) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": { value: 'Basic realm="Protected Area"' },
      },
    };
  }

  return request;
}
```

4. Clicca **Create function**
5. **Publish** la function

### Step 3: Collega la Function alla Distribution

1. Vai su **CloudFront** → **Distributions** → la tua distribution
2. Tab **Behaviors** → **Edit** (o **Create behavior**)
3. **Viewer request** → Seleziona la function `simo-slides-basic-auth`
4. **Save changes**

### Step 4: Aggiorna Bucket Policy

1. Vai su **S3** → `simo-slides` → **Permissions**
2. **Bucket policy** → **Edit**
3. Sostituisci con (aggiorna `ACCOUNT_ID` e `DISTRIBUTION_ID`):

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
      "Resource": "arn:aws:s3:::simo-slides/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::732266568315:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

## Opzione 2: Lambda@Edge (Più Flessibile ma a Pagamento)

Se hai bisogno di più controllo (es. utenti multipli, database), usa Lambda@Edge.

### Vantaggi Lambda@Edge:

- Supporta più utenti
- Può leggere da database/secrets
- Più flessibile

### Svantaggi:

- Costi (anche se minimi)
- Più complesso da configurare

## 🔒 Sicurezza

**IMPORTANTE**:

- Non committare mai le password nel codice
- Considera di usare **AWS Secrets Manager** per le credenziali
- Usa password forti
- Considera di cambiare le credenziali periodicamente

## 📝 Note

- CloudFront Functions è **gratuito** (entro i limiti)
- Le credenziali sono hardcoded nella function (per semplicità)
- Per produzione, considera AWS Secrets Manager + Lambda@Edge

## 🚀 Dopo la Configurazione

1. Attendi 5-10 minuti per la propagazione CloudFront
2. Accedi al sito: `https://DISTRIBUTION_ID.cloudfront.net`
3. Il browser chiederà username e password
4. Inserisci le credenziali configurate

---

**Vuoi che ti aiuti a configurare CloudFront Functions per Basic Auth?** Posso creare uno script o una guida più dettagliata.
