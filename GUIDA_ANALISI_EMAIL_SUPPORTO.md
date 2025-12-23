## Analisi email di supporto Avacy

Questa guida spiega come usare gli script `tools` per:

- estrarre le email di supporto da Gmail
- raggrupparle per thread
- arricchirle con AI (categoria, riassunto, stato risolto)

### 1. Prerequisiti

- **Node.js 18+**
- `npm install` eseguito nella root del progetto
- Variabili in `.env` (nella root):

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

GEMINI_API_KEY=...                # chiave AI Studio per Gemini
GEMINI_MODEL=gemini-3-pro-preview # opzionale, default già impostato

# Query Gmail per trovare le email di supporto
GMAIL_SUPPORT_QUERY=to:support@avacysolution.com
```

Al primo utilizzo, lo script Gmail aprirà il browser per completare l’OAuth e salverà i token in `tools/.credentials/`.

### 2. Passo 1 – Scaricare e preparare le email

Per aggiornare i dati (scarico da Gmail + CSV per email):

```bash
cd /Users/simonem/Desktop/slides
export GEMINI_API_KEY="$GEMINI_API_KEY"  # opzionale per questa fase
npx tsx tools/src/analyze-emails.ts --from 2024-01-01 --ai --re-evaluate --limit 500
```

Questo script:

- usa `tools/src/gmail.ts` per scaricare le email che matchano `GMAIL_SUPPORT_QUERY`
- salva la cache completa in `tools/.cache/emails-cache.json`
- genera/aggiorna il CSV per email in `tools/output/emails_export_<from>_<oggi>.csv`
- mantiene un checkpoint in `tools/.cache/processing-checkpoint.json`

### 3. Passo 2 – Raggruppare per thread

Per passare da “una riga per email” a “una riga per thread”:

```bash
cd /Users/simonem/Desktop/slides
node tools/src/group-by-thread.mjs
```

Questo genera/aggiorna:

- `tools/output/emails_export_PER_THREAD.csv`  
  (una riga per ogni thread, con i body accorpati).

### 4. Passo 3 – Arricchire con AI (categoria, riassunto, risolto)

Lo script principale per l’AI è `tools/src/analyze-threads-csv.ts`.  
Esegue **una sola chiamata AI per thread** e chiede in JSON:

- `categoria`: una delle categorie in `tools/categories-emails.sample.json`
- `riassunto`: 3–4 parole
- `risolto`: `true/false` secondo le regole definite nel prompt

Esempio di esecuzione (limitata) con chiave esplicita:

```bash
cd /Users/simonem/Desktop/slides
export GEMINI_API_KEY=AIzaSyCdmyaUR2PPusZBJlm2Zt2DjjjVjXu46w8 && \
npx tsx tools/src/analyze-threads-csv.ts --limit 5
```

Opzioni utili:

- `--limit N`  
  processa solo i primi `N` thread (utile per non bruciare quota).

- `--start-row R` (o `--from-row R`)  
  parte dal thread `R` (1-based, riferito a `emails_export_PER_THREAD.csv`), es:

  ```bash
  export GEMINI_API_KEY=... && \
  npx tsx tools/src/analyze-threads-csv.ts --start-row 130 --limit 40
  ```

Output principale:

- `tools/output/emails_export_PER_THREAD_AI.csv`
  - solo thread di **supporto** (le email classificate come `"Altro"` vengono escluse)
  - colonne: `numeroMail, threadId, subject, from, cliente, to, data, categoria, riassunto, risolto, body`

Lo script mantiene anche:

- `tools/.cache/threads-checkpoint.json` con `categoria/riassunto/risolto` per ogni `threadId`

### 5. Categorie e filtraggio “non supporto”

Le categorie sono definite in `tools/categories-emails.sample.json`:

- `Problemi Setup/Installazione`
- `Aiuto su Utilizzo Piattaforma`
- `Bug`
- `Richiesta Feature`
- `Problema Fatturazione`
- `Altro` (newsletter, promozioni, proposte commerciali, inviti, candidature, spam, ecc.)

Durante l’arricchimento:

- Se la categoria AI è `"Altro"`, la riga **non** finisce nel CSV finale per supporto.
- Se la categoria è una delle prime 5, la riga viene tenuta e arricchita con:
  - `riassunto` 3–4 parole
  - `risolto`:
    - `true` se il supporto ha effettivamente risolto il problema (cliente soddisfatto)
    - `false` se feature non fornita, sistema non supportato, richiesta rifiutata, problema non risolto, ecc.

### 6. Comando “ufficiale” per analisi rapida

Dopo aver aggiornato i dati (Passo 1 + 2), per una run rapida di test:

```bash
cd /Users/simonem/Desktop/slides
export GEMINI_API_KEY=... && \
npm run tools:emails:analyze -- --limit 5
```

Attenzione:

- `tools:emails:analyze` è mappato a `tsx tools/src/analyze-threads-csv.ts`
- usa **solo** i dati già presenti in `tools/output/emails_export_PER_THREAD.csv`
- per aggiornare le email da Gmail, va eseguito prima `tsx tools/src/analyze-emails.ts` + `node tools/src/group-by-thread.mjs` come nei passi 2–3.
