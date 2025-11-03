# Tools: Export Calendario Google -> CSV

Questo tool (CLI) legge il tuo Google Calendar e genera un CSV con: titolo, data, ore, categoria.

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
