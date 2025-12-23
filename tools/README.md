# Tools: Export Calendario Google -> CSV e Analisi Email Support

Questo tool (CLI) include:

1. **Export Calendario**: legge il tuo Google Calendar e genera un CSV con: titolo, data, ore, categoria.
2. **Analisi Email Support**: estrae email di support da Gmail, le categorizza con AI e genera un CSV.

## Requisiti

- Node 18+
- OAuth Client in Google Cloud (tipo Desktop app) con Redirect: `http://localhost:3456/oauth2callback`
- Abilita API Google Calendar nel progetto GCP

Oppure, senza OAuth, puoi fornire un file `.ics` esportato da Google Calendar.

## Env (.env nella root del repo)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_ID=primary
# Opzionale per AI
GEMINI_API_KEY=...
# Opzioni di default
START_DATE=2025-01-01
CATEGORIES_FILE=tools/categories.sample.json
USE_AI=false
```

## Categorie

Modifica o duplica `tools/categories.sample.json`.

## Uso (Google API)

```
npm install
npm run tools:calendar:export -- --from 2025-07-01 --categories tools/categories.sample.json --ai
```

## Uso (ICS locale)

```
npm run tools:calendar:export -- --from 2025-07-01 --ics data/some-calendar.ics --categories tools/categories.sample.json
```

Parametri:

- `--from` data ISO (YYYY-MM-DD). Default: env `START_DATE` o 30 giorni fa
- `--calendar-id` default `GOOGLE_CALENDAR_ID` o `primary`
- `--categories` percorso file JSON categorie
- `--ai` abilita AI fallback se non trovate keyword (richiede `GEMINI_API_KEY`)
- `--ics` percorso file .ics da parsare invece di usare l'API
- `--out` percorso file CSV di output. Default: `tools/output/calendar_export_<from>_<today>.csv`

Alla prima esecuzione con Google API si apre un URL per autorizzare la lettura del calendario. Il token viene salvato in `tools/.credentials/token.json`.

---

## Analisi Email Support

Questo tool estrae le email di support da Gmail, le categorizza automaticamente e genera un CSV.

### Requisiti Email

- Node 18+
- OAuth Client in Google Cloud (tipo Desktop app) con Redirect: `http://localhost:3457/oauth2callback`
- Abilita API Gmail nel progetto GCP (oltre a Google Calendar)

### Env per Email (.env nella root del repo)

Aggiungi queste variabili:

```
# Query Gmail per trovare le email di support (default: "to:support@avacy.com")
GMAIL_SUPPORT_QUERY=to:support@avacy.com
# Oppure usa una label: label:support
# Oppure un gruppo: to:gruppo-support@avacy.com
```

### Categorie Email

Le categorie predefinite sono:

- **Feature Mancante**: richiesta di nuova funzionalità o miglioramento
- **Bug**: segnalazione di errore o malfunzionamento
- **Problema UI**: problemi di interfaccia utente, usabilità, design
- **Problema Fatturazione**: questioni relative a pagamenti, fatture, abbonamenti

Modifica `tools/categories-emails.sample.json` per personalizzare le keyword.

### Uso

```bash
# Analizza email degli ultimi 30 giorni (default)
npm run tools:emails:analyze

# Analizza email da una data specifica
npm run tools:emails:analyze -- --from 2025-01-01

# Analizza email in un range di date
npm run tools:emails:analyze -- --from 2025-01-01 --to 2025-01-31

# Usa una query personalizzata (es: label specifica o altro indirizzo)
npm run tools:emails:analyze -- --query "to:gruppo-support@avacy.com OR label:support"

# Abilita AI per categorizzazione più accurata
npm run tools:emails:analyze -- --from 2025-01-01 --ai

# Specifica file categorie personalizzato
npm run tools:emails:analyze -- --categories tools/categories-emails.sample.json --ai

# Limita il numero di email (default: 500)
npm run tools:emails:analyze -- --max-results 1000
```

### Parametri Email

- `--from` data ISO (YYYY-MM-DD). Default: env `START_DATE` o 30 giorni fa
- `--to` data ISO (YYYY-MM-DD). Default: oggi
- `--query` query Gmail personalizzata (default: `to:support@avacy.com` o env `GMAIL_SUPPORT_QUERY`)
- `--categories` percorso file JSON categorie (default: `tools/categories-emails.sample.json`)
- `--ai` abilita AI fallback se non trovate keyword (richiede `GEMINI_API_KEY`)
- `--out` percorso file CSV di output. Default: `tools/output/emails_export_<from>_<today>.csv`
- `--max-results` numero massimo di email da analizzare (default: 500)

### Output CSV

Il CSV generato contiene:

- `numeroMail`: ID univoco dell'email
- `threadId`: ID del thread (per raggruppare conversazioni)
- `subject`: oggetto dell'email
- `from`: mittente
- `data`: data dell'email (YYYY-MM-DD)
- `categoria`: categoria assegnata (Feature Mancante/Bug/Problema UI/Problema Fatturazione)
- `risolto`: boolean (default: false - puoi aggiornare manualmente o implementare logica automatica)

### Come estrarre email da un gruppo Google Workspace

Ci sono diverse opzioni:

1. **Usa l'indirizzo del gruppo** (consigliato):

   ```bash
   npm run tools:emails:analyze -- --query "to:gruppo-support@avacy.com"
   ```

2. **Usa una label Gmail** (se hai applicato una label alle email del gruppo):

   ```bash
   npm run tools:emails:analyze -- --query "label:support"
   ```

3. **Combina più criteri**:
   ```bash
   npm run tools:emails:analyze -- --query "to:gruppo-support@avacy.com OR to:support@avacy.com"
   ```

Alla prima esecuzione si apre un URL per autorizzare l'accesso a Gmail. Il token viene salvato in `tools/.credentials/token-gmail.json` (separato dal token del calendario).
