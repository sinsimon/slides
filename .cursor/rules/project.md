Progetto

- Repository personale di Simone Mazzotti (Tech Director @ Jump) per presentazioni e documenti.
- Hub di presentazioni: SPA per presentazioni/analisi modulari.
- Struttura: documenti non-slide in `src/documents/**`, slide in `src/slides/**`, presentazioni in `src/presentations/**`, componenti riutilizzabili in `src/components/**`, stili con CSS Modules.
- Navigazione: gestione indice slide via query string `?slide=<n>`; deploy su Netlify con redirect SPA.

Tecnologie

- React 18 + TypeScript + Vite.
- CSS Modules per lo styling scoped.
- HTML5 Drag & Drop nativo (no librerie esterne) per board Kanban.
- Parsing CSV manuale da file in `data/` o stringhe inline.

Linee guida di riuso/creazione componenti

- Riutilizzare prima di creare: preferire composizione ed estensione via props dei componenti esistenti (`DataTable`, `KV`, `TwoColumnSlide`, `MetricsPanel`, `MetricsGrid`).
- Creare un nuovo componente solo se:
  - il comportamento/layout non è copribile con varianti dei componenti esistenti; oppure
  - c’è riuso previsto in ≥ 2 slide; oppure
  - riduce significativamente la complessità del codice.
- Prediligere componenti generici e configurabili (props chiare, tipizzate), evitando duplicazione.

Documentazione componenti

- Ogni NUOVO componente in `src/components/**` deve essere documentato in `.cursor/rules/components.md`.
- La documentazione deve includere: descrizione breve, elenco props (tipi/obbligatorie/opzionali), esempio d'uso minimo e note UX/riuso.
- Aggiornare la documentazione quando si aggiungono/variano props pubbliche.

UX/UI e tabelle

- Header tabella a capo (no overflow), scrollbar verticale quando necessario.
- Celle con padding coerente; input compatti dove richiesto.
- Badges percentuali piccoli, sotto al valore e non selezionabili.
- Usare `colgroup`/larghezze per dare più spazio a colonne dense (es. "Progetti Lavorati").

Stato, calcoli e performance

- Isolare parsing/calcoli in helper; condividere utility quando usate da più slide.
- Usare `useMemo`/`useCallback` per calcoli costosi/derivati.
- Mantenere coerenza H1/annuo: prevedere toggle periodo e fattori H1 dove necessario.

Convenzioni di codice

- Tipi espliciti per API pubbliche; evitare `any` impliciti.
- Nomi descrittivi e leggibili; early return; niente nesting profondo.
- Evitare dipendenze esterne non necessarie (soprattutto per DnD/tabella).
- Default configurazioni: "Giorni lavorativi per risorsa" = 115 salvo override.

Deployment

- Assicurare routing SPA: `public/_redirects` oppure `netlify.toml` con redirect `/* -> /index.html 200`.
