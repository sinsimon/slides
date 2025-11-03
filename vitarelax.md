**Spett.le**  
PubliOne \- [Via Balzella, 81, 47122 Forlì FC](https://www.google.com/maps/place//data=!4m2!3m1!1s0x132ca8254fabeae9:0x62301060ad0bdb68?sa=X&ved=1t:8290&ictx=111)

**C.A.** Giulio Modanesi

**Data**: 07/08/2025

**Oggetto: Realizzazione nuovo sito web istituzionale e catalogo prodotti B2B**

###

## 1. Obiettivo del Progetto

Sviluppo di un nuovo sito web per Vitarelax, concepito come un catalogo prodotti avanzato (e-commerce senza carrello) per il mercato B2B. Il sito dovrà valorizzare il prodotto, facilitare il contatto con i rivenditori e ottimizzare i processi interni attraverso l'integrazione con il gestionale aziendale. La piattaforma dovrà essere flessibile, multilingua e facilmente gestibile dal team Vitarelax.

## 2. Piattaforma e Strumenti Tecnici

- **CMS:** WordPress
- **Tema WP:** **Gutenberg** (editor a blocchi), in linea con il design fornito.
- **Design:** Il design UI/UX verrà **fornito da PubliOne**.
- **Modulo E-commerce:** WooCommerce (utilizzato per la gestione del catalogo prodotti e ordini B2B, senza pagamento online).
- **Configuratore Prodotto:** Verrà mantenuto il **configuratore esterno** attualmente in uso.

## 3. Struttura e Funzionalità del Sito

3.1. Sezione Prodotti

- **Migrazione Dati:** I prodotti verranno migrati dal sito WordPress attuale. L'attività include la riconversione e l'adattamento dei dati alla nuova struttura. Sono esclusi data entry massivi o import da fonti terze.
- **Categorie Principali:**
  - Divani letto
  - Divani relax
  - Poltrone letto
  - Poltrone relax
  - Accessori
- **Pagina di Categoria:**
  - **Filtri dedicati** per affinare la ricerca (es. tessuto, misure, meccanismo di apertura, optional, novità).
  - **Griglia prodotti** con anteprime.
- **Anteprima Prodotto (in griglia):**
  - Immagine principale.
  - Nome del prodotto.
  - Icone per le caratteristiche principali (se presenti).
  - Etichetta "Novità 2025" (gestibile da backend).
  - Pulsante **"Configura"** che rimanda alla pagina di dettaglio del prodotto.
- **Pagina Dettaglio Prodotto:**

  - Descrizione dettagliata.
  - Galleria immagini (slideshow).
  - Scheda "Caratteristiche tecniche".
  - Scheda "Misure" con disegno tecnico.
  - Scheda "Materassi" (visibile solo per le versioni letto).
  - Sezione/CTA "Trova il rivenditore più vicino".

    3.2. Sezione Tessuti

- **Migrazione Dati:** I dati relativi ai tessuti presenti all’interno verranno migrati e adattati alla nuova struttura.
- **Pagina Archivio Tessuti:**
  - Visualizzazione di tutte le tipologie di tessuti disponibili.
  - Filtri per categoria/tipologia.
- **Pagina Dettaglio Categoria Tessuto:**

  - Galleria colori e varianti.
  - Composizione del materiale.
  - Caratteristiche tecniche.
  - Istruzioni di lavaggio.

    3.3. Pagine Istituzionali e di Servizio

- **Home, Menu e Footer**
- **Pagina Azienda:** Pagina informativa con storia, identità e missione di Vitarelax.
- **Pagina Punti Vendita:**
  - Mappa interattiva per la ricerca dei rivenditori (eventuale migrazione della struttura dati esistente).
  - Campo di ricerca per indirizzo o città.
  - Elenco dei rivenditori più vicini con dettagli (nome, indirizzo, contatti).
- **Pagina Pronta Consegna:**
  - Elenco dei prodotti disponibili a magazzino.
  - Dettagli per ogni prodotto: nome, caratteristiche principali, colore del tessuto, quantità disponibile.
- **Pagina Contatti:** Informazioni di contatto aziendali e form di contatto.
- **Area Press:** Sezione con approfondimenti, articoli, rassegna stampa e notizie.

## 4. Aree Riservate e Funzionalità B2B

4.1. Area Rivenditori (Protetta da Password)

- **Flusso di Registrazione e Accesso:**
  1. L'utente rivenditore compila un form di registrazione.
  2. Il sistema invia una notifica all'amministratore.
  3. La registrazione deve essere **approvata manualmente da un admin** dal backend di WordPress.
  4. L'admin associa l'utente approvato al **listino prezzi corretto**.
  5. L'utente riceve una mail di conferma e può effettuare il login.
- **Funzionalità Post-Login:**

  - **Visualizzazione Prezzi e Ordini:** Una volta effettuato l'accesso, l'utente potrà visualizzare i prezzi a lui riservati direttamente sulle pagine prodotto. Potrà portare i prodotti al checkout e creare un ordine. I metodi di pagamento non verranno gestiti online, in quanto la fatturazione avverrà secondo le modalità B2B concordate. In fase di design si valuterà la modalità di visualizzazione più efficace.
  - **Download Materiali:** Sezione per scaricare listini, promozioni e cataloghi PDF

    4.2. Integrazione E-commerce B2B e Gestionale

- **Integrazione Gestionale (Gamma Enterprise di TeamSystem):**

  - **Sincronizzazione Listini:** L'integrazione proposta si basa su un'esportazione periodica dei listini dal gestionale Gamma in un formato strutturato (es. JSON). Il sito WordPress sarà configurato per leggere questo file a intervalli regolari e aggiornare automaticamente i prezzi associati ai rivenditori. La specifica definitiva del formato dati e della frequenza di sincronizzazione verrà concordata durante la fase di analisi tecnica.
  - **Gestione Ordini:** Il sistema permetterà ai rivenditori loggati di creare un ordine dal checkout. _Nota: la sincronizzazione automatica di questo ordine verso il gestionale Gamma non è inclusa nella stima attuale e la sua fattibilità potrà essere discussa in fase di discovery iniziale._

    4.3. Sistema di Landing Page per Store

- **Obiettivo:** Creazione di landing page dedicate per ogni punto vendita (stimati 50-100 store).
- **Soluzione Tecnica:** Verrà sviluppato un sistema di creazione di pagine flessibile basato su **blocchi di contenuto riutilizzabili**, gestibili da CMS. In una fase iniziale, il cliente (Vitarelax o PubliOne) potrà collaborare con noi per definire la libreria di blocchi da sviluppare (es. blocco testata, galleria immagini, mappa, form di contatto, elenco prodotti, etc.). Una volta che questi componenti saranno stati creati, il cliente potrà comporre in totale autonomia le diverse landing page, combinando i blocchi a seconda delle necessità specifiche di ogni store.

## 5. Requisiti e Attività Tecniche

- **Design:** Responsive e ottimizzato per tutti i dispositivi.
- **Testing:** Cross-browser prima della messa online.
- **Gestione Contenuti (Backend):** Il backend dovrà essere intuitivo per la gestione autonoma di prodotti, tessuti, punti vendita, area rivenditori e landing page.

  5.1 Setup Tecnico e Ambiente di Lavoro

- **Setup Ambienti di Sviluppo:** Verranno configurati due ambienti server distinti per garantire un flusso di lavoro sicuro e controllato:
  - **Ambiente di Staging:** Un'area di lavoro privata dove verrà installato WordPress, il tema e i plugin. Questo ambiente sarà utilizzato per lo sviluppo, i test interni e per le revisioni con il cliente prima della pubblicazione.
  - **Ambiente di Produzione:** Il server pubblico finale dove il sito verrà trasferito e reso accessibile agli utenti al momento del go-live.
- **Setup Multilingua (IT, EN, FR):** Verrà installato e configurato un plugin professionale (es. WPML) per la gestione completa delle tre lingue. Questa attività include la creazione della struttura per la traduzione di pagine, prodotti e altri contenuti, nonché l'impostazione del selettore di lingua nel frontend.

  5.2 Attività SEO

Verrà svolta un'attività di ottimizzazione per i motori di ricerca di base, che include:

- **Analisi Tecnica e Keyword Research:** Analisi preliminare della struttura del sito e del settore di riferimento per identificare le parole chiave strategiche da utilizzare nei contenuti.
- **Setup SEO Base e Struttura URL:** Configurazione dei file robots.txt e sitemap.xml, e definizione di una struttura di permalink SEO-friendly.
- **Implementazione Dati Strutturati (Schema.org):** Inserimento di dati strutturati per arricchire i risultati di ricerca (rich snippet). Verranno implementati schemi per Organization (Azienda), Product (Prodotti) e Article (Articoli del blog/press).
- **Setup Redirect 301:** In caso di migrazione da un sito esistente con URL differenti, verrà impostato un piano di reindirizzamenti 301 per preservare il posizionamento acquisito e non perdere traffico.

  5.3 Architettura WordPress e Standard di Sviluppo

- **Approccio Tema/Builder:** L'implementazione seguirà il design fornito da PubliOne con **Gutenberg**, sviluppando blocchi custom riutilizzabili (Hero, Griglia Prodotti, Card Tessuti, Mappa Store, CTA), con campi configurabili da backend.
- **Custom Post Types (CPT):** `prodotti`, `tessuti`, `punti_vendita`, `press_item`.
- **Tassonomie:** `categoria_prodotto`, `tipologia_tessuto`, `collezione_anno`, `novita` (flag), `tag_prodotto`.
- **Campi Personalizzati:** gestione tramite ACF PRO (o equivalente) per caratteristiche tecniche, misure, varianti, icone features, etichetta Novità, asset galleria.
- **E-commerce B2B:** WooCommerce come base per catalogo e checkout senza pagamento, con visibilità prezzi condizionata al ruolo/listino.
- **Standard di Codice:** WordPress Coding Standards (WPCS) enforced con PHPCS; nomenclatura consistenze, funzioni namespaced; nessuna modifica core.
- **Controllo Versione:** Git con branching model semplificato (main, release, hotfix). Versionamento semantico per tema child e plugin custom.

  5.4 Modello Dati e Regole di Compilazione

- **Prodotto:** titolo, slug, categoria_prodotto, galleria immagini, descrizione, caratteristiche tecniche (lista key/value), scheda misure (immagine + tabella), materassi (condizionale), flag novità, codice interno/SKU, icone features, documenti (PDF scheda tecnica).
- **Tessuto:** titolo, tipologia_tessuto, galleria varianti colore, composizione, caratteristiche tecniche, istruzioni lavaggio.
- **Punto Vendita:** nome, indirizzo geocodificato, contatti, orari, coordinate, servizi, copertura brand.
- **Regole Backend:** campi obbligatori con validazioni; prevenzione pubblicazione se mancano asset critici (immagine principale prodotto, categoria, almeno una misura).

  5.5 Filtri, Ricerca e Navigazione Facettata

- **Categorie Prodotto:** pagine archivio con filtri su tassonomie e meta (tessuto, misure, meccanismo, optional, novità).
- **Tecnica:** query WP ottimizzate (indice su meta comuni), `pre_get_posts` per controllare parametri; persistenza filtri via querystring e URL SEO-friendly.
- **Caching:** risultati filtro con transients e invalidazione su update prodotto.
- **Ricerca:** integrazione con ricerca nativa WP potenziata per CPT e tassonomie rilevanti.

  5.6 Migrazione Dati (Dettaglio e Validazioni)

- **Inventario Sorgente:** estrazione prodotti/tessuti/press dal WP esistente.
- **Mappatura Campi:** documento di mapping campo→campo sul nuovo modello (ACF/WC). Inclusa normalizzazione tassonomie.
- **Strumenti:** import tramite WP All Import (o script custom) con template salvati e riutilizzabili.
- **Dry Run:** esecuzione prova su staging con campione dati, verifica contenuti e URL.
- **Validazioni:** checklist post-import (conteggio record, tassonomie assegnate, immagini presenti, campi obbligatori).
- **Redirect:** definizione mappa 301 per URL modificati.

  5.7 Performance e Ottimizzazioni

- **Immagini:** generazione WebP/AVIF, lazy-loading, dimensioni responsive, compressione lossless.
- **Front-end:** minificazione e concatenazione asset, HTTP/2, preloading font critici.
- **Server/Cache:** page cache, object cache (transients), ottimizzazione query su archivi prodotti.
- **CDN (opzionale):** valutazione attivazione CDN per asset statici.
- **Budget Performance:** LCP < 2.5s su pagine principali in condizioni medie di rete.

  5.8 Sicurezza, Privacy e Compliance

- **Hardening WP:** disabilitazione editor file, protezione endpoint sensibili, limit login attempts, reCAPTCHA su form.
- **Ruoli e Permessi:** ruoli custom per rivenditori; capacità limitate al minimo necessario.
- **Aggiornamenti:** politica di aggiornamenti controllati su staging prima del rilascio.
- **Privacy:** banner cookie e gestione consensi; registro trattamenti per dati rivenditori; minimizzazione dei dati raccolti.
- **Backup:** snapshot giornalieri con retention 30 giorni; test di restore periodico.

  5.9 QA, Test e Criteri di Accettazione (UAT)

- **Matrix Test:** browser supportati (ultime 2 versioni Chrome, Safari, Firefox, Edge), mobile iOS/Android recenti.
- **Test Funzionali:** flussi principali (navigazione catalogo, filtri, login rivenditore, visualizzazione prezzi, creazione ordine B2B, download materiali).
- **Load Test (pre go-live):** eseguito su staging per validare performance e stabilità sotto carico realistico. Obiettivi: tempi di risposta costanti e assenza di errori applicativi a picchi concordati. Report condiviso con eventuali azioni correttive.
- **Criteri UAT:** per ciascun requisito chiave è definito un esito verificabile (es.: prezzo corretto dopo login con listino assegnato).
- **Bug Tracking:** segnalazioni consolidate con priorità P1–P3 e finestra di fix pre-go-live.

  5.10 Logging, Metriche e Monitoraggio

- **Attività Backend:** log attività amministrative (creazione/modifica prodotti, approvazioni utenti) tramite plugin di audit.
- **Errori:** logging errori PHP/WP in file dedicati con rotazione; alert su errori ripetuti.
- **Analytics:** GA4 con eventi su interazioni chiave (filtri, contatti, download, avvio ordine B2B).

  5.11 Deployment, Versioning, Backup e Rollback

- **Flusso:** sviluppo su staging → validazione → rilascio su produzione.
- **Rilascio:** pacchetto tema/plugin versionato; migrazioni contenuti/ACF sincronizzate.
- **Backup Pre-rilascio:** dump DB + archivio `wp-content` con possibilità di rollback.
- **Manutenzione:** finestra di manutenzione breve con pagina 503 temporanea, se necessario.

  5.12 Assunzioni, Vincoli, Documentazione e Timeline

- **Assunzioni:** disponibilità fonti dati esistenti coerenti; approvazioni design tempestive; builder unico **Gutenberg** scelto all’avvio.
- **Vincoli/Esclusioni:** non inclusa sincronizzazione in tempo reale col gestionale; niente pagamenti online; nessuna funzione PIM avanzata; integrazioni extra fuori ambito.
- **Documentazione Consegna:** manuale amministrazione (prodotti, tessuti, listini, landing), schema dati CPT/tassonomie, checklist migrazione e redirect.
- **Timeline Indicativa:** durata stimata 6–8 settimane calendarizzate, allineate ai 37,5 giorni uomo: Setup/Discovery (1), Sviluppo core+B2B (3), Sistema Landing (1), SEO/QA/Go-live (1.5). Le settimane dipendono da approvazioni e disponibilità contenuti.

  5.13 DevOps: Architettura e Infrastruttura (Cloud + IaC)

- **Hosting:** piattaforma cloud gestita con risorse dimensionate in base al traffico atteso.
- **Infrastruttura come Codice (IaC):** **Trellis** per provisioning, hardening e deploy (Ansible).
- **Stack LEMP:** Nginx, MariaDB, PHP 8.1+, Composer, WP-CLI.
- **Sicurezza:** **Let’s Encrypt** (SSL), **Fail2ban**, firewall (UFW), SSH key-only.
- **Prestazioni server:** **Memcached** e micro-caching su Nginx per pagine/archivi.
- **Accesso e gestione:** accesso SFTP/SSH tramite chiavi, deploy senza downtime.
- **Ambienti:** staging e produzione configurati in Trellis con variabili per ambiente e vault sicuro.

  5.14 Gestione Media, CDN e Email Transazionali

- **Amazon S3:** offload media WordPress con sincronizzazione automatica dei file caricati.
- **Amazon CloudFront:** distribuzione CDN dei contenuti statici/media, integrazione diretta con S3.
- **Policy cache:** definizione TTL e invalidazioni mirate post-deploy per asset versionati.
- **Amazon SES:** invio email transazionali (notifiche WP, recupero password) via SMTP autenticato, con **SPF/DKIM/DMARC** configurati per alta deliverability.

  5.15 Codebase, GitHub e CI/CD (Bedrock + GitHub Actions + Trellis)

- **Bedrock:** struttura Composer-first per WordPress con `web/` come document root, `.env` per ambiente, mu-plugins e gestione dipendenze versionata.
- **Gestione configurazioni:** separazione credenziali e segreti per ambiente; nessun secret nel repository (uso Trellis Vault/Secrets CI).
- **GitHub:** repository privato con protezione su `main` e flusso `main`/`release`/`hotfix`.
- **Pipeline CI/CD (deploy automatico su modifica):**
  - Linting e qualità: PHPCS (WPCS) su PR; build tema/plugin e `composer install --no-dev --optimize-autoloader` in CI.
  - Deploy: **GitHub Actions** esegue Trellis (`ansible-playbook`/`deploy.yml`) verso staging/produzione via SSH, con rollback automatico su failure.
  - Artefatti: pacchetti buildati (tema, plugin custom) allegati ai job per audit.
- **Rollback:** gestione releases con symlink (stile Capistrano/Trellis) e ritorno alla release precedente in pochi secondi.
- **Invalidazione CDN:** step opzionale di invalidazione CloudFront post-deploy per asset critici.

  5.16 Provisioning e IaC con Trellis (in repository)

- **Repository Infrastruttura:** configurazione Trellis versionata in Git (inventari `production`/`staging`, `group_vars`, `host_vars`, ruoli Ansible e playbook).
- **Provisioning Automatizzato:** creazione/riconfigurazione dell'istanza EC2/Lightsail con un solo comando (Trellis/Ansible), includendo hardening, utenti SSH, firewall, PHP/Nginx/MariaDB, Let’s Encrypt.
- **Gestione Segreti:** credenziali e variabili d’ambiente conservate in vault cifrato per ciascun ambiente; nessun secret in chiaro nel repository.
- **Allineamento Applicazione:** integrazione con Bedrock e deploy Trellis per garantire coerenza tra infrastruttura e codice applicativo.
- **Ripetibilità:** l’IaC elimina drift di configurazione e riduce il rischio nelle ri-installazioni o scalaggi futuri.

  5.17 Backup Operativi con Duply/Duplicity su Amazon S3

- **Strumenti:** Duply (wrapper di Duplicity) per backup incrementali con compressione e crittografia end‑to‑end.
- **Ambito di Backup:** database e file applicativi rilevanti (esclusione cache/temporanei). Bucket S3 in `eu-central-1` non pubblico, con policy bloccanti; opzionale bucket in `eu-south-1` (Milano).
- **Frequenza:** backup incrementale ogni 6 ore; full backup ogni 3 giorni.
- **Retention:** conservazione di completi e incrementali per 2 mesi, con Lifecycle Policies S3 per rimozione automatica dei backup obsoleti per contenere i costi.
- **Crittografia:** dati cifrati a riposo (S3 SSE-AES256) e in transito (TLS). Chiavi/parametri di cifratura gestiti in modo sicuro.
- **Integrazione:** oltre agli snapshot citati in 5.8, i backup applicativi consentono restore puntuale.
- **Test di Ripristino:** verifica periodica del restore su staging per validare integrità ed RTO.

  5.18 Regioni AWS e Account

- **Regioni AWS:**
  - Hosting principale: data center vicino al pubblico (es. `eu-central-1` Francoforte o `eu-south-1` Milano).
- **Account AWS:** account condiviso con altri progetti ma risorse isolate: bucket S3 dedicato con chiavi univoche, istanza dedicata, policy perimetrali separate.

## 6. Riepilogo Economico (Stima)

| Voce                                                   | Costo        |
| :----------------------------------------------------- | :----------- |
| Gestione Progetto e Setup Tecnico (4 giorni)           | € 2.000      |
| Sviluppo Funzionalità Core e B2B (23,5 giorni)         | € 11.750     |
| Sviluppo Sistema Landing Page (5 giorni)               | € 2.500      |
| Attività SEO, Testing e Go-Live (5 giorni)             | € 2.500      |
| Implementazione singola landing page (costo 10 giorni) | € 5.000      |
| **Totale Sviluppo Iniziale (37,5 giorni)**             | **€ 23.750** |

## Note

Tutti i prezzi sono IVA esclusa;

Le modalità di fatturazione verranno concordate in sede di contratto.

Eventuali attività differenti da quelle descritte nella presente offerta commerciale saranno oggetto di successivo accordo, parametrato in modo congruo ed appropriato al rapporto commerciale instaurato. **Il presente documento non costituisce contratto o accordo tra le parti, il cliente entro 30 giorni dalla data di consegna del presente documento potrà richiedere il contratto e sottoscrivere l’offerta.**

#
