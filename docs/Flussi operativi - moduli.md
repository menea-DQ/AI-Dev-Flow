# AI-Dev Flow — Moduli di contesto

> **Stato: BOZZA in lavorazione** — documento progettuale interno.
> Questo documento definisce i **moduli di contesto** di un flusso di sviluppo AI-assistito:
> gli ambiti di conoscenza che il flusso deve gestire perché il lavoro sia affidabile e ripetibile.
> È **agnostico da tool e implementazione**: descrive il *cosa* e il *perché*, mai il *come*
> (niente prodotti, script, meccanismi). L'implementazione è un capitolo successivo e separato.

## Cos'è un modulo di contesto

Un **modulo di contesto** è un ambito di conoscenza che il flusso deve saper:

1. **reperire** — dove vive quella conoscenza, e come portarne al lavoro solo la parte necessaria;
2. **usare** — in quali momenti del flusso serve, e a cosa;
3. **mantenere** — come resta vero nel tempo (il contesto invecchia).

## Principio di modularità

I moduli sono pensati per essere **autoconsistenti e adottabili uno per volta**:

- ogni modulo risponde a **un'esigenza precisa** (dichiarata in testa al modulo);
- nessun modulo presuppone gli altri: si può adottare da solo e produce valore da solo;
- i moduli si **potenziano a vicenda**, ma non si richiedono a vicenda;
- un **flusso strutturato completo** è il risultato della composizione graduale dei moduli —
  non un prerequisito. Si parte dall'esigenza più sentita, si aggiunge un modulo per volta.

Per ogni modulo il documento dichiara:
**Esigenza** · **Perché è importante** · **Quali difficoltà presenta** · **Tipologie (esempi)**.

## Mappa dei moduli

| Area | Moduli |
|---|---|
| **Ingresso** | 1. Richiesta · 2. Dominio e business |
| **Definizione** | 3. Specifica · 4. Stime ed effort |
| **Sistema** | 5. Codebase e architettura · 6. Convenzioni e regole di progetto |
| **Verifica** | 7. Test, qualità e dati |
| **Memoria** | 8. Documentazione · 9. Storia e decisioni · 10. Stato e continuità del lavoro |
| **Contorno operativo** | 11. Ambiente ed esecuzione · 12. Sicurezza e compliance · 13. Integrazione con sistemi esterni |
| **Oltre il singolo progetto** | 14. Gestione multi-progetto |

## Priorità dei moduli

*Da compilare insieme al team: quale esigenza è più sentita, da quale modulo partire.*

| Modulo | Priorità |
|---|---|
| 1. Richiesta | |
| 2. Dominio e business | |
| 3. Specifica | |
| 4. Stime ed effort | |
| 5. Codebase e architettura | |
| 6. Convenzioni e regole di progetto | |
| 7. Test, qualità e dati | |
| 8. Documentazione | |
| 9. Storia e decisioni | |
| 10. Stato e continuità del lavoro | |
| 11. Ambiente ed esecuzione | |
| 12. Sicurezza e compliance | |
| 13. Integrazione con sistemi esterni | |
| 14. Gestione multi-progetto | |

---

## 1. Richiesta

*La domanda in ingresso: cosa è stato chiesto, da chi, perché, con quale urgenza.*

**Esigenza:** capire davvero cosa è stato chiesto, prima di investirci lavoro.

**Perché è importante**
- È l'origine di ogni lavoro: un fraintendimento qui si propaga a tutte le fasi successive.
- Normalizzare la richiesta separa il segnale (cosa serve, a chi, perché) dal rumore del canale
  da cui arriva (formato, tono, dettagli accidentali).
- La classificazione (evolutiva vs difetto vs assistenza) determina il percorso che il lavoro seguirà.

**Difficoltà**
- Le richieste arrivano nel linguaggio di chi le scrive, non in quello del sistema: incomplete,
  ambigue, con contesto implicito ("come al solito", "come per l'altro cliente").
- Chi segnala descrive il **sintomo**, non la causa — e a volte propone già una soluzione, che va
  trattata come indizio, non come requisito.
- La priorità dichiarata non sempre coincide con quella reale.
- Canali eterogenei (ticket, email, conversazioni) con formati e completezza diversissimi;
  riferimenti e allegati sparsi.

**Tipologie (esempi)**
- Richiesta evolutiva (nuova funzionalità o modifica)
- Segnalazione di difetto (bug)
- Richiesta di assistenza / domanda (che può nascondere una delle due precedenti)
- Attività interna: manutenzione, aggiornamento, debito tecnico
- Urgenza / incident

---

## 2. Dominio e business

*La conoscenza del mondo che il software serve: regole, linguaggio, attori.*

**Esigenza:** decidere nel merito, non solo nella tecnica.

**Perché è importante**
- Il codice implementa regole di business che **non sono scritte nel codice**: senza dominio si
  producono soluzioni tecnicamente corrette ma sbagliate nel merito.
- Il glossario evita i falsi amici: la stessa parola ("ordine", "pratica", "cliente") significa
  cose diverse in progetti diversi.
- Molte scelte di priorità e di rischio ("questo campo non si tocca a fine mese") sono
  comprensibili solo conoscendo il business.

**Difficoltà**
- È conoscenza in gran parte **tacita**: vive in parte nelle persone, in parte incorporata nel
  progetto stesso (codice, configurazioni, documenti sparsi) — da lì va estratta e formalizzata,
  e nessun task lo richiede esplicitamente finché la sua assenza non produce un errore.
- Cambia col business, e ogni progetto/cliente ha la sua: non è riusabile tra progetti.
- Dosaggio: non si può caricare "tutto il dominio" su ogni attività; serve capire quanta e quale
  conoscenza serve per il singolo task.

**Tipologie (esempi)**
- Glossario di dominio (i termini e il loro significato in questo progetto)
- Regole di business (vincoli, calcoli, casi speciali)
- Attori e stakeholder (chi usa cosa, chi decide cosa)
- Vincoli normativi o contrattuali di settore
- Processi aziendali che il software supporta

---

## 3. Specifica

*Il contratto di ciò che va fatto: comportamento atteso, confini, criteri di accettazione.*

**Esigenza:** accordarsi su cosa va fatto, prima di farlo.

**Perché è importante**
- È la fase a **più leverage** dell'intero flusso: un errore in specifica costa un ordine di
  grandezza in più quando emerge a valle.
- È il contratto da cui derivano in modo indipendente sia l'implementazione sia la verifica:
  la qualità della specifica determina la qualità di tutto ciò che segue.
- Comprensione prima dell'azione: la specifica è il luogo dove le ambiguità si risolvono con
  domande, non con assunzioni.

**Difficoltà**
- Capire quando è "abbastanza" definita: il raffinamento può essere infinito, e i buchi veri a
  volte emergono solo implementando.
- Estrarre i requisiti impliciti (ciò che il richiedente dà per scontato).
- Distinguere il **cosa** (contratto) dal **come** (implementazione): una specifica che prescrive
  la soluzione ruba spazio alle fasi successive e nasconde alternative.
- Valutare l'impatto sul passato: la richiesta contraddice scelte deliberate già fatte?
- Mantenere il legame specifica ↔ codice ↔ verifica nel tempo.

**Tipologie (esempi)**
- Specifica funzionale (comportamento atteso, casi d'uso)
- Criteri di accettazione (come si riconosce il "fatto bene")
- Specifica di correzione (riproduzione del difetto + comportamento corretto)
- Registro domande & risposte (le ambiguità risolte, con chi le ha risolte)
- Analisi di impatto (cosa tocca, cosa rischia di rompere)

---

## 4. Stime ed effort

*Quanto costa il lavoro: dimensione, tempo, incertezza — prima e dopo averlo fatto.*

**Esigenza:** sapere quanto costa, prima di impegnarsi — e imparare dagli scostamenti.

**Perché è importante**
- Le decisioni di priorità e fattibilità ("lo facciamo? quando? vale la pena?") si prendono sulla
  stima: senza, si decide al buio.
- La stima governa le aspettative verso chi ha chiesto il lavoro: uno scostamento comunicato in
  anticipo è gestione, uno scoperto alla fine è un problema.
- La **dimensione stimata** determina il percorso: un lavoro piccolo può meritare un iter
  alleggerito, uno grande richiede il percorso completo — ma serve un criterio dichiarato, non
  l'istinto del momento.
- Il confronto **stima vs consuntivo** è l'unico modo per migliorare le stime future.

**Difficoltà**
- Stimare **prima di aver guardato il sistema** è divinazione: la stima affidabile richiede
  un'analisi che ha essa stessa un costo — va accettato un doppio livello (stima di massima
  presto, stima vera dopo l'analisi).
- La stima tende a diventare **impegno**: una volta detta, viene trattata come promessa.
- Ottimismo sistematico e ancoraggio (la prima cifra detta condiziona tutte le successive).
- L'incertezza è parte della stima, ma comunicarla è difficile: un intervallo onesto sembra
  meno professionale di un numero secco sbagliato.
- Consuntivare richiede di tracciare l'effort reale — disciplina che sotto pressione salta per
  prima.

**Tipologie (esempi)**
- Stima di massima in fase di ingresso (dai soli segnali della richiesta)
- Stima puntuale dopo l'analisi (a sistema guardato)
- Soglie di dimensione dichiarate (cosa è "piccolo", e cosa cambia se lo è)
- Consuntivo e scostamento (quanto è costato davvero, perché è diverso)

---

## 5. Codebase e architettura

*La conoscenza del sistema com'è ora: struttura, invarianti, punti di modifica sicura.*

**Esigenza:** modificare il sistema senza rompere ciò che non si vede.

**Perché è importante**
- Ogni modifica avviene dentro un sistema esistente: senza la mappa si rompe ciò che non si vede.
- Gli **invarianti** (cosa il sistema garantisce e non deve smettere di garantire) contano più dei
  dettagli: sono ciò che una modifica non deve violare.
- Il **recupero mirato** — leggere prima la mappa, poi solo i pochi file giusti — è ciò che rende
  il lavoro AI sostenibile per costo e affidabile per qualità: il contesto totale non è un'opzione.

**Difficoltà**
- La codebase è troppo grande per essere "tutta contesto": la selezione di cosa leggere è essa
  stessa un problema cognitivo.
- La mappa scritta va tenuta allineata: **una mappa in drift è peggio di nessuna mappa**, perché
  autorizza decisioni sbagliate con fiducia.
- "Dove si modifica in sicurezza" è la conoscenza più preziosa e più spesso tacita.
- Sistemi multi-contesto (più applicazioni, pacchetti, servizi): perimetrare l'impatto di una
  modifica attraverso i confini.

**Tipologie (esempi)**
- Documento di architettura **per contesto** (cosa fa, come si incastrano i pezzi, invarianti) —
  sempre al presente: la storia vive altrove
- Mappa delle dipendenze tra contesti
- Punti di estensione e aree fragili
- Contratti esposti (API, interfacce tra contesti)

---

## 6. Convenzioni e regole di progetto

*Le regole con cui si lavora in questo progetto: dichiarate, non inferite.*

**Esigenza:** ottenere lo stesso risultato indipendentemente da chi (persona o AI) fa il lavoro.

**Perché è importante**
- Un'AI che **inferisce** le convenzioni dal codice le inferisce diverse ogni volta (varianza) e
  cristallizza gli errori esistenti come se fossero regole.
- Le convenzioni dichiarate rendono il codice di autori diversi — umani e AI — indistinguibile:
  è la condizione perché il risultato sia uno standard e non uno stile personale.
- Le soglie e le policy (quando un task è "piccolo", quanti giri di raffinamento sono troppi)
  trasformano giudizi ricorrenti in regole, sottraendoli alla discrezionalità del momento.

**Difficoltà**
- Sono quasi sempre **non scritte**: farle emergere richiede un'intervista esplicita, non
  un'ispezione del codice.
- Tenerle aggiornate quando il team cambia idea: la convenzione dichiarata e disattesa è
  varianza mascherata da standard.
- Il confine tra convenzione (vincolo) e abitudine (caso storico) non è ovvio nemmeno per il team.

**Tipologie (esempi)**
- Convenzioni di codice (naming, struttura, pattern ammessi)
- Convenzioni di versionamento (nomi dei rami, messaggi, granularità)
- Regole sulle dipendenze (cosa si può usare, cosa va approvato)
- Soglie e policy di processo (dimensione "piccola", limiti di raffinamento)

---

## 7. Test, qualità e dati

*La definizione operativa di "funziona" — sul comportamento e sui dati — e la strategia per verificarlo.*

**Esigenza:** provare che il cambiamento fa ciò che deve e non ha rotto nulla — né nel
comportamento, né nei dati.

**Perché è importante**
- I test sono l'unico "funziona" che non dipende dall'opinione di chi ha scritto il codice.
- L'**ordine è sostanza**: test derivati dal contratto *prima* del codice verificano; test scritti
  *dopo* il codice lo confermano (teaching-to-the-test).
- Una strategia di test **dichiarata** per il progetto (quale tipo di verifica per quale tipo di
  cambiamento) evita che ogni attività inventi la propria — o la salti.
- Per i difetti: un test che riproduce il bug (rosso → verde) è insieme prova della correzione e
  garanzia di non-regressione futura.
- Quando il cambiamento tocca codice che **produce o trasforma dati persistenti**, il "funziona"
  non è osservabile dal solo codice: serve confrontare i dati **prima e dopo**. Gli errori sui
  dati sono i più costosi: spesso silenziosi, a volte irreversibili, visibili al cliente prima
  che al team.

**Difficoltà**
- **Indipendenza**: se chi implementa può toccare i test, i test misurano l'implementazione, non
  il contratto. L'indipendenza va garantita strutturalmente, non chiesta per favore.
- **Selezione**: scegliere quali verifiche lanciare per un dato cambiamento è un compromesso
  costo/copertura; le aree senza regola dichiarata inducono a tirare a indovinare.
- La tentazione di "aggiustare il test" invece del codice quando fallisce.
- Test lenti o instabili erodono la fiducia nell'intero meccanismo.
- La verifica vale per **quel** codice: se il codice cambia dopo la verifica, la verifica è scaduta.

*Specifiche della verifica sui dati:*
- La **finestra temporale**: lo stato "prima" si può catturare **solo finché il codice è
  intatto** — è una finestra irripetibile; persa quella, la prova di non-regressione non esiste
  più. Il momento giusto è facile da mancare, e non torna.
- Volumi e riservatezza: non sempre i dati si possono copiare o portare nel contesto di lavoro.
- Definire gli **invarianti di confronto** (totali, conteggi, chiavi, distribuzioni): cosa deve
  restare uguale perché il cambiamento sia "non regressivo"?
- Dati di prova rappresentativi: il caso sintetico che non copre il caso reale dà falsa fiducia.

**Tipologie (esempi)**
- Test unitari e di integrazione
- Test end-to-end (percorsi utente)
- Non-regressione (incluso il test rosso derivato da un bug)
- Validazione della specifica (il risultato rispetta il contratto?)
- Confronto pre/post sui dati: snapshot di non-regressione, invarianti dichiarati
- Dataset di prova e fixture; schema dei dati e sue migrazioni
- Dati sensibili: mascheramento e anonimizzazione nei dati di prova

---

## 8. Documentazione

*La conoscenza scritta per chi arriva dopo: persone, sessioni, fasi successive.*

**Esigenza:** non ri-scoprire ogni volta ciò che è già noto.

**Perché è importante**
- È l'**interfaccia** tra sessioni, persone e tempi diversi: ciò che non è scritto va ri-scoperto
  ogni volta (costo) o assunto (rischio).
- Per un flusso AI-assistito è doppiamente critica: la documentazione è il **contesto d'ingresso**
  delle fasi che leggono il sistema — documentazione buona = recupero economico e affidabile.
- Documentare dal cambiamento reale (cosa il sistema *è diventato*) e non dal racconto di chi lo ha
  fatto produce documentazione più fedele e uniforme.

**Difficoltà**
- **Allineamento**: la documentazione invecchia in silenzio; un documento in drift è peggio di
  nessun documento. Tenerla allineata non può dipendere dalla buona volontà: dev'essere un
  passaggio del flusso.
- **Impatto**: capire *quali* documenti un cambiamento tocca non è meccanico (il documento non
  rispecchia la struttura dei file): è una valutazione sull'**ambito dichiarato** di ogni documento.
- Il **silenzio è ambiguo**: "nessun documento impattato, perché…" è un esito valido; non dire
  nulla no.
- Scrivere al **presente**: la documentazione che accumula storia ("prima era così…") diventa
  illeggibile; la storia ha un altro posto.
- Destinatari diversi richiedono linguaggi diversi: il documento tecnico e quello per il cliente
  non si scrivono uguali.
- Sapere **quali documenti esistono e cosa coprono** è a sua volta conoscenza da mantenere
  (l'indice, con l'ambito di ciascuno).

**Tipologie (esempi)**
- Documentazione tecnica / architetturale (per chi sviluppa)
- Documentazione utente / per il cliente (per chi usa)
- Documentazione operativa (procedure, runbook — per chi gestisce)
- Documentazione dei contratti esposti (API, integrazioni)
- Registro della documentazione (l'indice: quali documenti, con quale ambito)

---

## 9. Storia e decisioni

*Il perché delle scelte: ciò che il presente del codice non può spiegare.*

**Esigenza:** non contraddire per sbaglio le scelte deliberate del passato.

**Perché è importante**
- Il codice dice *cosa* fa il sistema, mai *perché* è così: senza il registro delle decisioni,
  ogni scelta passata è indistinguibile da un caso.
- L'**analisi di impatto** ("questa richiesta contraddice una scelta deliberata?") è possibile
  solo se le scelte deliberate sono scritte.
- Per i difetti: la storia dei cambiamenti indica quale evoluzione ha introdotto il problema.
- Le **deroghe registrate** trasformano le eccezioni in fatti governati e auditabili; le deroghe
  silenziose sono buchi nello standard.

**Difficoltà**
- La **disciplina**: la voce di changelog va scritta ogni volta, col perché — è il primo passo che
  salta sotto pressione, ed è quello il cui valore si vede solo mesi dopo.
- Separare la decisione dalla cronaca: il diff dice già il *cosa*; il registro serve per il
  *perché* e per le alternative scartate.
- **Ritrovare** la decisione rilevante quando serve: un log che nessuno riesce a interrogare è
  scrittura senza lettura.
- Non duplicare ciò che il versionamento registra già per conto suo.

**Tipologie (esempi)**
- Changelog delle decisioni (append-only: la scelta e il perché)
- Registro delle deroghe ed eccezioni (con motivazione)
- Registro domande & risposte delle specifiche
- Decisioni architetturali di lungo periodo
- Storia del codice (delegata al versionamento)

---

## 10. Stato e continuità del lavoro

*A che punto siamo: i fatti del lavoro in corso, indipendenti dalla memoria di chi lo svolge.*

**Esigenza:** riprendere e passare di mano il lavoro senza perdite.

**Perché è importante**
- Un flusso in più fasi vive più a lungo di una sessione di lavoro e di una singola persona:
  senza uno stato, ogni interruzione è un ricominciare e ogni passaggio di mano un rischio.
- Se lo stato è un registro di **fatti** (cosa è stato approvato, prodotto, verificato), allora
  "qual è il prossimo passo" è **derivabile** dai fatti — non affidato alla memoria (umana o AI),
  che dimentica, si convince, degrada.
- Rende possibile la **ripresa** (si riparte da dov'era) e il **subentro** (un collega legge lo
  stato e continua).
- L'**abbandono** di un lavoro è un esito legittimo ma da governare: cosa va compensato (rami da
  chiudere, sistemi da avvisare, materiali da ripulire) dev'essere noto, non improvvisato.

**Difficoltà**
- Registrare senza burocratizzare: se registrare un fatto costa più del fatto, il registro muore.
- Il registro **mente per difetto**: un fatto vero ma non registrato è, per il flusso, un fatto
  non avvenuto — la disciplina di registrazione è tutto.
- Lo stato deve **puntare** agli artefatti, non contenerli: altrimenti diventa un ostaggio invece
  di un indice ricostruibile.

**Tipologie (esempi)**
- Stato di avanzamento per attività (fase, cose fatte, cose mancanti)
- Registro delle approvazioni (chi ha approvato cosa, quando)
- Elenco degli artefatti prodotti (specifica, ramo, verifiche…)
- Compensazioni in caso di abbandono

---

## 11. Ambiente ed esecuzione

*Dove e come il software gira: ambienti, build, deploy, configurazione.*

**Esigenza:** portare il cambiamento fino a dove il software gira davvero.

**Perché è importante**
- Il codice non vive nel repository: senza conoscere ambienti e procedure, "funziona da me" non
  significa nulla.
- Le differenze tra ambienti (locale, collaudo, produzione) sono una fonte classica di difetti che
  nessun test sul codice cattura.
- Le procedure di rilascio sono parte del contratto del lavoro: un cambiamento "finito" ma non
  rilasciabile non è finito.

**Difficoltà**
- La conoscenza operativa è spesso **solo nella testa di chi rilascia**: la meno documentata di
  tutte.
- **Credenziali e segreti** non possono entrare nel contesto di lavoro: il confine tra "conoscere
  la configurazione" e "conoscere i segreti" va disegnato esplicitamente.
- Riprodurre localmente le condizioni degli ambienti reali; ambienti che driftano tra loro.
- L'osservabilità (log, metriche) è il contesto necessario per diagnosticare, ma va saputa leggere
  e non sempre è accessibile.

**Tipologie (esempi)**
- Mappa degli ambienti (quali esistono, a cosa servono, come differiscono)
- Procedure di build e rilascio
- Configurazione per ambiente (e dove vivono i segreti — non i segreti stessi)
- Servizi esterni da cui il sistema dipende
- Osservabilità: dove guardare quando qualcosa non va

---

## 12. Sicurezza e compliance

*I vincoli sempre attivi: dati, accessi, norme — anche quando il task non li nomina.*

**Esigenza:** non trasformare un errore in un incidente.

**Perché è importante**
- Alcuni errori non sono difetti ma **incidenti**: dati esposti, accessi impropri, violazioni
  contrattuali. Il costo non si misura in rilavorazione.
- I vincoli normativi e contrattuali (privacy, trattamento dati, obblighi di settore) sono
  requisiti **sempre attivi**, anche quando la richiesta non li menziona.
- In un flusso AI-assistito c'è una superficie in più: **il contesto stesso** — cosa il sistema
  può leggere, dove finisce ciò che legge, cosa non deve mai transitare (segreti, dati personali).

**Difficoltà**
- È **trasversale**: nessuna attività "è di sicurezza" finché non lo è — il vincolo va ricordato
  dal flusso, non dalla memoria di chi lavora.
- I vincoli sono spesso impliciti, dati per scontati, o noti solo a chi ha firmato il contratto.
- La competenza specialistica non è sempre presente nel team: serve sapere almeno *quando chiedere*.
- Il compromesso con l'attrito: la sicurezza percepita come ostacolo viene aggirata.

**Tipologie (esempi)**
- Gestione di credenziali e segreti (dove vivono, dove non devono comparire)
- Dati personali e privacy (cosa c'è, come va trattato)
- Controllo degli accessi (chi può fare cosa)
- Vincoli normativi e contrattuali del progetto
- Perimetro del contesto AI (cosa è leggibile, cosa non deve transitare)

---

## 13. Integrazione con sistemi esterni

*I sistemi con cui il flusso dialoga: da dove arrivano le richieste, dove si riporta l'esito.*

**Esigenza:** dare visibilità dell'esito a chi ha chiesto il lavoro, senza doppia scrittura manuale.

**Perché è importante**
- Il flusso non vive isolato: le richieste nascono in sistemi di ticketing e assistenza, e lì il
  richiedente si aspetta di vedere l'esito — la **tracciabilità end-to-end** verso il cliente
  passa da qui.
- La doppia scrittura manuale ("fai il lavoro, poi ricordati di aggiornare il sistema") è il primo
  anello che salta: l'aggiornamento dei sistemi esterni va reso parte del flusso, non un dopo.
- Verificare che l'integrazione funzioni **prima** di dipenderne evita di scoprire a metà lavoro
  che il canale è rotto.

**Difficoltà**
- **Eterogeneità**: ogni sistema ha il suo modello (stati, priorità, entità); serve una
  normalizzazione — un contratto unico verso il flusso — perché il processo non cambi al cambiare
  del tool.
- Le **scritture** verso sistemi esterni hanno effetti visibili al cliente: un errore lì non è un
  errore interno.
- Disponibilità, permessi e credenziali: l'integrazione è un punto di fallimento esterno al team.
- La mappatura concettuale (lo "stato di arrivo" di un lavoro nel sistema del cliente) è una
  decisione, non un automatismo.

**Tipologie (esempi)**
- Sistemi di ticketing / project management (da cui arrivano le richieste)
- Sistemi di helpdesk / assistenza clienti (segnalazioni degli utenti finali)
- Sistemi di versionamento e revisione del codice (dove si consegna)
- Canali di comunicazione e notifica
- Sistemi di integrazione continua / rilascio

---

## 14. Gestione multi-progetto

*Il contesto che attraversa i progetti: standard condivisi, riuso della conoscenza, separazione tra clienti.*

**Esigenza:** far circolare la conoscenza tra i progetti senza mescolare i contesti dei clienti.

**Perché è importante**
- Chi lavora — persona o AI — opera su più progetti: senza uno standard condiviso ogni progetto
  sviluppa il suo dialetto, e cambiare progetto costa un riapprendimento ogni volta.
- I problemi si ripresentano: una soluzione trovata nel progetto A (un pattern, una correzione,
  una decisione) vale spesso anche nel progetto B — senza un canale di riuso, lo stesso costo si
  paga due volte.
- Il confine tra **standard aziendale** e **scelta di progetto** va dichiarato: altrimenti ogni
  progetto reinventa lo standard, o lo subisce dove non si adatta.
- La vista d'insieme (cosa è in corso, su quale progetto, a che punto) serve alle decisioni di
  priorità e di capacità — è il livello a cui il singolo progetto non può rispondere.

**Difficoltà**
- **Separazione dei contesti**: la conoscenza del cliente A non deve finire nel lavoro per il
  cliente B — per riservatezza e per pertinenza. Si riusano le *soluzioni*, mai i *dati* o le
  informazioni proprietarie di un cliente.
- Il compromesso standard/autonomia: uno standard troppo rigido non si adatta ai progetti reali;
  uno troppo lasco non è uno standard.
- La conoscenza cross-progetto non ha un proprietario naturale: dentro il progetto ogni contesto
  ha una casa; tra i progetti, nessuno — va deciso chi la mantiene e dove vive.
- **Propagazione**: quando lo standard evolve, come raggiunge i progetti già avviati senza
  romperli?

**Tipologie (esempi)**
- Standard aziendali (processo, convenzioni di base, strumenti ammessi)
- Conoscenza riusabile tra progetti (pattern, soluzioni note, decisioni di valore generale)
- Regole di separazione tra contesti/clienti (cosa non attraversa mai il confine)
- Deroghe per-progetto rispetto allo standard (dichiarate, mai silenziose)
- Vista di portafoglio (le attività in corso, per progetto)

---

## Temi trasversali

Ricorrono in quasi tutti i moduli; sono i principi che qualunque implementazione dovrà rispettare.

- **Il drift è il nemico comune.** Ogni contesto scritto invecchia; un contesto stantio è peggio
  di uno assente, perché autorizza decisioni sbagliate con fiducia. L'allineamento dev'essere un
  passaggio del flusso, non buona volontà.
- **Dichiarato, non inferito.** Ciò che conta (convenzioni, strategia di verifica, ambiti dei
  documenti) va chiesto alle persone e scritto — mai dedotto dal codice, che registra anche gli
  errori.
- **Contesto minimo e mirato.** Ogni fase riceve solo ciò che le serve: è insieme economia (costo)
  e qualità (meno rumore, meno bias, contratti di fase verificabili).
- **Fatti, non memoria.** Ciò che è avvenuto va registrato; ciò che va fatto si deriva dai fatti.
  La memoria — umana o AI — dimentica, si convince, degrada.
- **Il silenzio non è un esito.** "Nessun impatto, perché…" è una risposta; non dire nulla no.
  Vale per documentazione, verifiche, deroghe.
- **La decisione resta umana.** Il contesto serve l'AI per *eseguire* bene e la persona per
  *decidere* bene; nessun modulo sposta il confine tra i due.

---

## Domande aperte (in lavorazione)

- **Documentazione verso il cliente**: oggi non esiste nulla di formalizzato; tipologie e obblighi
  reali da arricchire con il contributo dei colleghi.
- **Dominio e business**: la conoscenza vive oggi in parte nelle persone, in parte nel progetto;
  la formalizzazione (glossari, regole) è lavoro futuro col team.
- **Tabella delle priorità**: da compilare insieme ai colleghi.
