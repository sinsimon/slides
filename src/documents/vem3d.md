**Versione:** 1.0  
**Data:** 2025-09-04

**Proposta Tecnica e Strategica: Piattaforma di Visualizzazione e configurazione 3d per la Gestione di Spazi di lavoro.**

_Obiettivo: Proporre una struttura di progetto per lo sviluppo di una piattaforma di visualizzazione 3D, che trasformi le planimetrie CAD in gemelli digitali interattivi._

Le aziende di oggi affrontano la sfida di gestire gli spazi fisici in un'era di lavoro ibrido e di risorse limitate. Le tradizionali planimetrie 2D sono disegni statici che non offrono una visione dinamica e in tempo reale dell'occupazione, impedendo l'ottimizzazione e una gestione agile.

La nostra soluzione è una piattaforma completa che trasforma i disegni CAD 2D in modelli 3D interattivi. Offriamo uno strumento end-to-end che copre ogni fase, dalla conversione automatica del modello alla gestione operativa degli spazi. Il nostro obiettivo è semplice: dare vita ai vostri piani di lavoro, migliorando l'efficienza e l'esperienza utente.

###

###

###

### **Obiettivi**

Il progetto si pone l'obiettivo di sviluppare una piattaforma avanzata per la visualizzazione e la gestione interattiva di spazi indoor, trasformando planimetrie 2D in modelli 3D navigabili.

**Obiettivi di Business:**

- **Ottimizzazione della Gestione Spazi:** Fornire uno strumento per la visualizzazione dello stato di occupazione di sale riunioni, postazioni di lavoro e altri punti di interesse (POI).
- **Miglioramento dell'Esperienza Utente:** Offrire funzionalità di navigazione indoor (wayfinding) per guidare gli utenti verso destinazioni specifiche all'interno di un edificio.
- **Integrazione Flessibile:** Fornire un SDK (Software Development Kit) che permetta di integrare facilmente la visualizzazione 3D e il configuratore nelle applicazioni esistenti.
- **Efficienza Operativa:** Semplificare il processo di digitalizzazione delle planimetrie attraverso un configuratore amministrativo intuitivo.

**Obiettivi Tecnici:**

- **Ingestione Multi-formato:** Sviluppare un sistema in grado di processare planimetrie da file DWG (in futuro è possibile pensare di implementare formati come PDF e PNG)
- **Configurazione Semplificata:** Realizzare un'interfaccia di configurazione che permetta agli amministratori di caricare le planimetrie, posizionare marker (es. sale, servizi, postazioni) e definire i percorsi.
- **Rendering Performante:** Garantire un'esperienza di navigazione 3D fluida e reattiva su browser web, anche con modelli complessi.
- **Architettura Scalabile e Distribuibile:** Progettare un sistema che possa essere installato sia in un ambiente cloud multi-tenant che on-premise presso l'infrastruttura del cliente.

### **Componenti Architetturali**

La piattaforma è composta da tre macro-componenti principali che lavorano in sinergia:

1. **Servizio Backend**: Il cuore della piattaforma, gestisce l'integrazione con APS per la conversione dei file CAD, le API per la gestione dei dati (marker, configurazioni) e la logica di calcolo del routing. L'installazione on-premise avverrà tramite container Docker.
2. **SDK 3D**: Una libreria JavaScript integrabile che include il componente di configurazione amministrativo e i componenti di visualizzazione runtime, per caricare i file CAD, configurare la mappa 3D e interagire con i dati (marker, piani, routing).

### **Configuratore Frontend**

Il configuratore è un componente dell'SDK 3D dedicato alla creazione del "gemello digitale".

#### **Tecnologie**

- **Frontend**: Sviluppato con un framework reattivo come **React** per garantire reattività e performance.
- **Visualizzazione 3D**: L'interfaccia di visualizzazione si baserà su **Three.js** e sulla libreria ufficiale **Autodesk Viewer SDK**, che supporta nativamente il formato SVF/SVF2. Questo garantisce un rendering efficiente dei modelli complessi.

#### **Funzionalità**

L'applicazione permetterà all'amministratore di gestire l'intera configurazione del proprio edificio, piano per piano.

- **Gestione dei Piani**: L'utente potrà caricare i file DWG/DXF per ogni singolo piano dell'edificio, associando ciascun file a un piano specifico tramite un'interfaccia intuitiva.
- **Conversione e Visualizzazione**: Dopo il caricamento, il backend invierà il file al servizio di conversione APS. L'amministratore potrà monitorare lo stato del processo e visualizzare il modello 3D convertito direttamente nel browser.
- **Posizionamento dei Marker**: L'amministratore, utilizzando il mouse per "cliccare" su muri e pavimenti, potrà posizionare con precisione i marker di interesse. La funzionalità di **raycasting** fornirà le coordinate esatte.
- **Configurazione dei Marker**: Sarà possibile associare metadati a ciascun marker, definendone il tipo (sala riunioni, servizio, postazione, ecc.) e altre informazioni rilevanti.
- **Routing Indoor (su un singolo piano)**: Il configuratore permetterà di definire il percorso di navigazione all'interno di un singolo piano.
- **Gestione Punti di Interesse (POI)**: Sarà possibile definire e gestire i punti di interesse, come bagni, uscite di emergenza e punti di ristoro, per ogni piano.

#### **Funzionalità del Viewer 3D**

- Navigazione 3D: orbita, pan, zoom, viste predefinite
- Selezione e tooltip: evidenzia elementi e proprietà
- Avvio di navigazione wayfinding
- API eventi per integrazione applicativa

Le funzionalità relative al routing multi-piano e alla gestione dei collegamenti (scale/ascensori) **non sono previste in questa prima fase**, poiché l'attuale architettura è pensata per visualizzare e gestire un piano alla volta.

### **Servizio Backend**

Il servizio backend è il cervello dell'applicazione, gestisce la logica di business e le interazioni con i servizi esterni.

#### **Tecnologie**

- **Linguaggio di Programmazione**: Python, per la sua affidabilità e la vasta libreria di integrazioni con i servizi cloud.
- **Framework**: **Flask** o **FastAPI** per un'architettura API leggera e performante.
- **Containerizzazione**: **Docker**, per garantire la portabilità e la facile installazione on-premise.
- **Integrazioni**: **Autodesk Platform Services (APS)** per la conversione dei file CAD.
- **Message Queue**: **RabbitMQ** o tecnologie simili per la gestione asincrona delle code di elaborazione in particolare per la pipeline di conversione CAD.

#### **Funzionalità**

- **Pipeline di Conversione CAD**: Riceve i file DWG/DXF caricati dal configuratore, li invia all'API di conversione di Autodesk e, tramite **webhooks**, riceve le notifiche a lavoro completato.
- **Algoritmo 2D→3D (Python)**: Trasforma l'output 2D normalizzato in modello 3D (estrusioni muri/solai, chiusura poligoni, topologia ambienti) pronto per il viewer.
- **Persistenza su Storage**: Al termine della conversione, salvataggio del modello 3D e dei marker su storage concordato con VEM (cloud o on‑prem), con metadati associati.
- **Gestione Dati Multi-Tenant**: L'architettura del backend è pensata per gestire in modo sicuro i dati di più clienti. Riceve un **tenant ID** per ogni richiesta, garantendo che ogni operazione (caricamento, salvataggio, recupero dati) avvenga all'interno dello spazio del cliente corretto. Il sistema **non gestisce la creazione e la gestione degli utenti**, ma si affida al sistema di autenticazione già in uso dal cliente.
- **API RESTful**: Espone una serie di endpoint API per la gestione dei file, dei marker, delle configurazioni e del routing.

#### **Installazione On-Premise (Docker)**

Il backend verrà fornito come un insieme di container Docker. Il processo di installazione prevederà:

1. Fornitura di un file `docker-compose.yml` preconfigurato.
2. I container Docker includeranno l'applicazione backend (Python), gli eventuali layer persistenti per la gestione delle code e un server web per esporre le API.

**Fasi del progetto**

Il progetto seguirà un approccio agile, diviso in fasi incrementali. Le tecnologie specifiche (come framework e librerie) verranno finalizzate durante la fase di analisi iniziale.

- **Fase 1: Analisi e Design (1-2 mese)**
  - Definizione finale dell'architettura e delle tecnologie.
  - Design del database e degli endpoint API.
  - Raccolta e analisi dei requisiti UX/UI per il configuratore.
  - Studio e stesura delle linee guida per la preparazione dei file DWG.
  -
- **Fase 2: Sviluppo Backend e Pipeline APS (1-3 mese)**

  - Implementazione del sistema multi-tenant basato su token ID.
  - Sviluppo degli endpoint API per la gestione delle mappe, dei marker e del routing.
  - Integrazione con Autodesk Platform Services e gestione dei webhooks.
  - Sviluppo dell'algoritmo 2D→3D in Python per la ricostruzione volumetrica dai dati 2D.
  - Configurazione dell'ambiente Docker per il deploy on-premise.

- **Fase 3: Sviluppo del Configuratore Web (2-3 mese)**

  - Implementazione dell'interfaccia utente per l'upload e la gestione dei piani.
  - Sviluppo del visualizzatore 3D e della logica di raycasting.
  - Creazione delle interfacce per la configurazione dei marker e l'associazione dei metadati.

- **Fase 4: Sviluppo SDK Web e Funzionalità Core (2-4 mese)**

  - Creazione della libreria JavaScript `mySDK` basata su Three.js.
  - Implementazione del rendering dei modelli 3D e dei marker.
  - Sviluppo della logica di colorazione dinamica degli spazi.
  - Implementazione del client-side per il calcolo del percorso e la sua visualizzazione.

- **Fase 5: Servizi Aggiuntivi e Refinement (4 mese)**

  - Sviluppo di un pannello per la gestione dei POI.
  - Sviluppo delle funzionalità per il routing.

- **Fase 6: Testing, Ottimizzazione e Deploy (4-5 mese)**
  - Testing completo della piattaforma.
  - Ottimizzazione delle performance.
  - Redazione della documentazione tecnica e del manuale d'uso.

###

### **Stima dei Costi**

Le stime dei costi sono indicative e basate su un approccio professionale e completo. Si riferiscono al costo totale del progetto, comprese le ore di lavoro e i costi operativi.

**Costi di Sviluppo (CAPEX )**

| Categoria Costo                             |                            Dettaglio                             | Giorni Stimati | Costo Stimato (€)  |
| ------------------------------------------- | :--------------------------------------------------------------: | :------------: | :----------------: |
| **Fase 1**: Architettura & Design           |                        Design, API, UI/UX                        |       20       |       12.000       |
| **Fase 2**: Backend & Pipeline APS & DevOps |        Integrazione APS, API BE, algoritmo 2Dto3D, Docker        |       50       |       30.000       |
| **Fase 3**: Sviluppo Configuratore          | UI upload, mappatura, posizionamento marker, gestione postazioni |       20       |       12.000       |
| **Fase 4**: Testing & Deploy (1 mese)       |     Testing, ottimizzazione performance, configurazione CDN      |       10       |       6.000        |
| **Totale Costo di Sviluppo Stimato**        |                                                                  |    **100**     |     **60.000**     |
| _Forbice di costo stimata per lo sviluppo:_ |                                                                  |                | _45.000 \- 75.000_ |

**Costi Operativi (OPEX)**

| Categoria Costo               | Dettaglio                                                                | Costo Stimato (€) |
| ----------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Licenze APS                   | 100 file/mese (con buffer)                                               | ≈ 5.000           |
| CDN & Storage                 | Traffico dati (50-100 GB/mese), storage modelli 3D/file sorgente         | ≈ 2.000           |
| Hosting Cloud                 | A carico del cliente (server con 1-2 core CPU, 16 GB RAM, SSD)           | \-                |
| Manutenzione & Supporto       | 15% costo sviluppo (bug fixing, aggiornamenti, assistenza) o a necessità | ≈ 9.000/necessità |
| **Totale OPEX annuo stimato** |                                                                          | **≈ 16.000**      |

###

###

### **Prospettive Future**

Il progetto è concepito con una solida base architetturale che ne permette l'evoluzione futura, espandendo le funzionalità e migliorando l'esperienza utente.

- Conversione con AI e Formati Alternativi: Come accennato, una delle evoluzioni più significative potrebbe essere l'implementazione di un motore basato su Intelligenza Artificiale (AI) per la conversione di planimetrie in formati non proprietari come PDF o immagini (PNG/JPG). Questo permetterebbe alla piattaforma di supportare un bacino di clienti più ampio, non vincolato all'utilizzo di file CAD. Un modello AI specializzato potrebbe estrarre automaticamente muri, finestre, porte e altri elementi semantici, riducendo drasticamente il lavoro manuale di configurazione.
- Routing Multi-Piano e Navigazione Avanzata: Sebbene la fase iniziale si concentri sulla navigazione su singolo piano, la roadmap futura prevede l'implementazione completa del routing multi-piano. Il sistema sarà in grado di calcolare percorsi che attraversano scale e ascensori, offrendo una navigazione completa all'interno di interi edifici. Questo richiederà lo sviluppo di un algoritmo di pathfinding più complesso e l'ottimizzazione del "metagrafo" di navigazione.
