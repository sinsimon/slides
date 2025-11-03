## CMP TV – Consuntivo Finale Attività

### Introduzione

La presente relazione illustra il consuntivo finale del progetto di estensione della Consent Management Platform (CMP) in ambito TV, con focus su RaiPlay. Vengono riportate le attività completate e il tempo-uomo complessivo investito, fornendo un quadro trasparente dei risultati conseguiti e delle sfide tecniche affrontate che hanno determinato il monte ore totale.

### Attività Concluse

#### 1. Smart TV (Samsung Tizen, LG WebOS, browser web-based)

**Stato Attuale**: Il banner della CMP è stato correttamente integrato, testato e reso funzionante su un ampio parco dispositivi (Samsung Tizen OS, LG WebOS, Hisense VIDAA, ecc.). L'interfaccia è coerente con le linee guida grafiche fornite, rispetta le specifiche di progetto ed è completamente navigabile tramite telecomando.

**Dettaglio consuntivo (giornate/uomo)**:

- **Smart TV (Tizen/WebOS)**: 16,0 g/u
  - _Dettaglio_: Rifiniture UI, gestione avanzata degli stati di focus, mapping personalizzato dei tasti del telecomando, gestione delle differenze tra i motori browser integrati, preparazione di asset grafici e packaging delle applicazioni per i singoli TV OS.
- **Smart TV (browser web-based)**: 4,0 g/u
  - _Dettaglio_: Assicurata la compatibilità con user-agent specifici e le loro limitazioni API, implementazione di fallback per eventi di input remoto, risoluzione di regressioni sulla navigazione a focus.

**Problematiche Tecniche Riscontrate**:

- **Retrocompatibilità dei browser**: La necessità di supportare versioni di browser molto datate (fino a Chrome 36, risalente al 2015) ha richiesto una riscrittura completa della UI e della logica JavaScript, con adozione di polyfill e pratiche compatibili con standard obsoleti.
- **Eterogeneità dei dispositivi**: L'ampia varietà di sistemi operativi e motori di rendering ha imposto un testing intensivo su dispositivi reali, con sviluppi ad-hoc per risolvere peculiarità di singoli modelli (tempi di rendering, gestione del focus).
- **Performance su hardware limitato**: Le scarse performance dei dispositivi, specialmente quelli più datati, hanno richiesto due cicli di refactoring completo per ottimizzare il rendering, semplificare il DOM e ridurre l'uso di JavaScript dinamico.
- **Inconsistenze CSS**: L'inaffidabilità delle tecniche responsive standard ha reso necessario un passaggio a layout pixel-perfect, con adattamenti rigidi per le risoluzioni 1080p e 720p.

---

#### 2. Android TV

**Stato Attuale**: Il banner è operativo e integrato tramite WebView all'interno dell'app Android TV. L'interfaccia è coerente, pienamente navigabile via telecomando e compatibile con le principali varianti dell'ambiente Android.

**Dettaglio consuntivo (giornate/uomo)**:

- **Android TV**: 12,0 g/u
  - _Dettaglio_: Adeguamenti dell'interfaccia per l'ambiente Leanback, implementazione di una gestione del focus custom, conformità alle policy dello Store e alle checklist di certificazione, ottimizzazioni delle performance su dispositivi entry-level.

**Problematiche Tecniche Riscontrate**:

- **Frammentazione delle WebView**: Le differenze tra le versioni di WebView hanno imposto l'adozione di fallback e l'esclusione di API JavaScript moderne.
- **Performance di caricamento**: L'overhead introdotto dalla WebView ha richiesto un'intensa attività di ottimizzazione per ridurre i tempi di apparizione del banner a un livello accettabile.
- **Navigazione via D-pad**: È stato necessario un mapping personalizzato tra eventi hardware (freccette, OK, back) e interazioni DOM (focus, click), con lo sviluppo di un sistema di gestione del focus ad-hoc.

---

#### 3. Attività Trasversali

**Dettaglio consuntivo (giornate/uomo)**:

- **Testing E2E e QA cross-device**: 6,0 g/u
  - _Dettaglio_: Esecuzione di una matrice di test completa su Tizen, WebOS, Android TV e browser-based; validazione UAT e risoluzione di fix minori.
- **Coordinamento e hand-off**: 2,0 g/u
  - _Dettaglio_: Allineamenti periodici con gli stakeholder, consolidamento delle build finali e consegna della documentazione tecnica e dei pacchetti.

---

### Riepilogo Monte Ore Complessivo

Il completamento delle attività ha richiesto un effort totale, quantificato come segue:

- **Totale consuntivo**: **40,0 giornate/uomo**.

Questo monte ore è interamente giustificato dalle complessità tecniche impreviste e dalla necessità di garantire un prodotto stabile e performante su un ecosistema frammentato, come dettagliato nelle sezioni precedenti.

### Potenziali Evoluzioni Future

Per il futuro della CMP, si delinea una strategia basata su un'architettura unificata per capitalizzare il lavoro svolto e ottimizzare gli sviluppi futuri:

- **Architettura Unificata**: Consolidare la logica di business in un core "headless" (TypeScript) e utilizzare React/React Native per le interfacce utente. Questo permetterà di estendere la stessa base di codice a nuove piattaforme come **tvOS (Apple)** e **Kepler (Amazon Fire TV)** con effort ridotto.
- **Migrazione a Nativo**: Sostituire l'attuale implementazione WebView su Android TV con un'interfaccia nativa (React Native). Questo porterà a un miglioramento sensibile delle performance, una gestione del focus più fluida e una coerenza totale con l'esperienza utente delle altre piattaforme.

### Nota Finale

L'effort complessivo di 40 giornate/uomo è una diretta conseguenza delle sfide poste dall'ecosistema TV: la frammentazione dei dispositivi, le performance hardware limitate e la necessità di un'approfondita fase di QA cross-device. Le competenze maturate in questo percorso rappresentano un valore aggiunto che permetterà di ridurre i rischi e ottimizzare i tempi nelle fasi successive del progetto. Il presente documento non espone costi, ma unicamente il consuntivo tecnico.
