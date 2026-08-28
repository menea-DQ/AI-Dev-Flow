# AI-Dev Flow — Processo
process-version: 0.5.0
compatibile-con: ">=0.5.0 <0.6.0"

## Principio fondante
L'AI esegue, la persona decide nei punti chiave (human-in-the-loop).
Tra i gate umani l'AI lavora in autonomia. Ai gate, si ferma e attende l'approvazione.

## Regola del 98% — comprensione prima dell'azione
Prima di QUALSIASI azione non banale (scrivere o modificare codice, comando distruttivo,
cambio di config, redazione di spec o piano) l'AI deve essere almeno al 98% sicura
di aver capito COSA le viene chiesto e PERCHÉ.
- Se è sotto il 98%: SI FERMA e fa domande mirate, finché non lo raggiunge.
- Non indovina, non "tappa" l'ambiguità con assunzioni, non parte "per vedere come va".
- Quando aiuta a far emergere un disallineamento, riformula all'utente la propria comprensione
  prima di procedere.
- "Non banale" è inteso in modo generoso: una correzione di refuso non richiede domande;
  tutto ciò che tocca dati, schema, pacchetti condivisi, logica di business o comportamento
  visibile all'utente sì.
Questa regola NON è opzionale e NON è situazionale: vale in ogni fase, per chiunque.
Una assunzione sbagliata su cui si agisce costa molto più di una domanda fatta in tempo.

## Garantito vs cognitivo vs umano
Il processo distingue tre nature di lavoro, e il kit le tratta diversamente:
- MECCANICO → garantito da hook e script deterministici (update ticket, gate di fase, guardiani).
- COGNITIVO → svolto da AGENTI DEDICATI per fase, ciascuno col modello adatto (vedi sotto).
- DECISIONALE → sempre umano (i 3 gate + ogni deroga). Nessuna deroga è silenziosa: tutte sono
  registrate nello STATO DEL TASK con motivazione (auditabili).

## Stato per-task
Ogni task ha uno stato persistito (`.ai-dev/tasks/<id>/state.json`, unico accesso via
`bin/flowState.mjs`): fase corrente, gate approvati, branch, artefatti prodotti, verifiche,
deroghe. È un registro di FATTI, non un workflow engine. Effetti: gli hook possono far rispettare
i contratti di fase; un task interrotto RIPRENDE da dov'era; un collega può SUBENTRARE leggendo lo
stato. Lo stato punta agli artefatti, non li contiene: è ricostruibile, mai un ostaggio.

## Sequencer deterministico (anti single-point-of-failure cognitivo)
"Qual è il prossimo passo" NON è una decisione dell'AI: è una funzione dei fatti registrati,
calcolata dal comando `flowState.mjs next` (prima condizione non soddisfatta = prossimo passo,
con l'azione da svolgere e il comando di registrazione). L'orchestratore esegue un loop:
next → esegui → registra → next. Così la DIREZIONE del flusso è codice (meccanico), non memoria
dell'agente; gli hook restano l'ENFORCEMENT indipendente. L'orchestratore è usa-e-getta: qualunque
sessione, letto lo stato, produce la stessa sequenza.
Il sequencer registra anche gli INIZI-AZIONE nel log dello stato (`sequencer → <passo>`, una volta
per passo indicato): i fatti timestampano i completamenti, e senza l'altro estremo gli intervalli
fra i gate non distinguono il tempo macchina dall'attesa umana. È ciò che rende i tempi del
processo misurabili a posteriori, ritorni su passi già visti inclusi. Il comando
`flowState.mjs report` riassume le durate per passo dal log (i passi con fermate umane sono
annotati): è così che si vede DOVE un task è stato lento, prima di ottimizzare alla cieca.

## Abbandono e compensazioni
Un task si può abbandonare solo per scelta umana motivata: `flowState.mjs abort --reason "<r>"`.
Lo stato si chiude e resta come audit trail; il comando elenca le COMPENSAZIONI da proporre
(eliminare il branch di lavoro, annotare il ticket via --comment, ripulire lo snapshot).

## Economia del contesto (il costo non deve crescere col numero di task)
Il costo di un task non deve dipendere da quanti task sono già stati svolti. Ciò che lo fa crescere
è la RILETTURA: artefatti che si allungano a ogni incremento e che ogni fase rilegge per intero, in
contesti isolati che non condividono nulla. Da qui quattro regole strutturali:
- Ogni artefatto di memoria è diviso in una parte NORMATIVA breve e una NARRATIVA. Le fasi a valle
  leggono la prima; la seconda si scrive sempre (è la memoria) e si legge solo per tracciare una
  decisione nominata. Vale per il changelog (testa "Vincolante", max 15 righe) e per la specifica
  (parte normativa autosufficiente).
- Le MISURE si citano dalla FONTE PRIMARIA (gli input di Fase 0 in `.ai-dev/tasks/<id>/inputs/`),
  non di seconda mano: una cifra che passa di documento in documento si corrompe.
- Il TIER DEL MODELLO è dichiarato nel frontmatter dell'agente e non si sovrascrive alla chiamata
  (vedi sotto): "per sicurezza" significa pagare una fase intermedia al prezzo di quella top. Vale
  anche per il thread principale, dove l'implementazione esegue un piano già approvato: il tier top
  si paga dove si DECIDE (spec, piano), non dove si esegue.
- I RIMBALZI sono il costo peggiore, perché raddoppiano una fase intera. Si prevengono a monte
  (contratto d'ingresso completo, controllo di osservabilità prima del gate), non si rincorrono.
Il costo che NON si taglia è la separazione dei ruoli: sub-agent isolati, gate umani, Fase 4 come
revisione. È il presidio che trova i difetti, e vale ciò che costa.

## Agenti per fase (modello per fase)
Il lavoro cognitivo di ogni fase è svolto da un sub-agent dedicato, eseguito col modello adatto
alla natura della fase (qualità dove serve, economia dove basta). L'isolamento è anche un
contratto: un sub-agent riceve SOLO i suoi input dichiarati, non la conversazione.
- intake (Fase 0) → modello economico: normalizzazione meccanica.
- spec-author (Fase 1) → modello top: la fase a più leverage.
- plan-author (Fase 2) → modello top: traduce il COSA in COME, l'unica lettura profonda della
  codebase del flusso. Un COME sbagliato si paga con un rifacimento.
- test-author (Fase 2) → modello intermedio: la derivazione è resa MECCANICA a monte (parte
  normativa autosufficiente, un osservabile dichiarato per clausola). Dove non è meccanica il
  difetto è nella spec, e si corregge lì.
- test-runner (Fase 3) → modello economico: esegue comandi e riporta esiti.
- doc-author (Fase 4) → modello intermedio: scrittura fedele su input dichiarati.
I gate umani restano SEMPRE nell'orchestratore (skill flow): gli agenti preparano, l'utente decide.
Il tier è DICHIARATO nel frontmatter dell'agente e non si sovrascrive alla chiamata: il parametro
`model` dell'invocazione prende precedenza sul frontmatter, quindi passarlo — anche "per sicurezza" —
disattiva il tiering. Se un tier è sbagliato, si corregge il frontmatter, non la chiamata. Se
l'utente rifiuta una delega, il lavoro svolto in linea gira sul modello del thread principale: il
costo va DICHIARATO prima di procedere, non scoperto dopo.

## Economia dell'attenzione (l'utente non legge la narrazione: la salta)
Il processo gira in gran parte in automatico, quindi ciò che l'AI scrive mentre lavora non viene
letto — e in più sommerge le due sole cose che vanno lette: i gate e le domande. È un costo doppio:
token di output (i più cari) spesi per rendere ILLEGGIBILE il momento della decisione. La regola è
**poco mentre lavori, molto quando chiedi**:
- Mentre il flusso gira: una riga per passo del sequencer (fase, esito, fatto registrato). Non si
  riassume il lavoro di un sub-agent, non si parafrasa l'istruzione di un hook, non si commenta ciò
  che il diff mostra già.
- Gli ARTEFATTI NON SI INCOLLANO nella chat: spec, piani, changelog e diff vivono in file, e ciò
  che si scrive è il PERCORSO. La bozza di spec e quella di piano nascono su file nella cartella
  del task (`spec-draft.md`, `plan-draft.md`) proprio per questo: prima della 0.4.0 esistevano solo
  nella conversazione, quindi il gate era costretto a riversarle.
- Ai GATE si scrive ciò che serve a DECIDERE: 5-15 righe (cosa è stato prodotto, quali scelte
  comporta, quali rischi), il percorso del file, e cosa serve dall'utente.
- Un errore che blocca il flusso è l'eccezione: si dice subito, per intero, col rimedio.

## Il contratto della domanda
Una domanda è il punto in cui il processo chiede di decidere: se non è comprensibile, la decisione è
peggiore, e una decisione peggiore diventa un emendamento — cioè un rimbalzo, il costo peggiore del
processo. Quindi ogni domanda porta: **cosa si sta decidendo**, **perché la si chiede ora** (cosa
manca, con la fonte precisa: quale clausola, quale file, quale voce di changelog), **cosa cambia** in
base alla risposta, e **2-4 opzioni con la conseguenza di ciascuna**.
Due vincoli strutturali, non stilistici:
- Chi ha il contesto DEVE consegnarlo insieme alla domanda. Un sub-agent formula le sue domande
  avendo letto spec, codice e changelog; l'orchestratore no, e non può aggiungere un contesto che
  non ha mai avuto. Per questo i contratti dei sub-agent impongono le quattro voci sopra per ogni
  domanda.
- Le domande dei sub-agent si RISCRIVONO, non si inoltrano. Inoltrarle verbatim è la causa più
  comune di domande incomprensibili: sono state scritte per un lettore che aveva tutto in testa.
- Le FERMATE si accorpano: ogni stop è un context switch per chi risponde, e il tempo di un task
  lo mangiano le attese moltiplicate per gli stop. Un gate si chiude in una fermata sola con le
  decisioni annesse (Gate 2: piano + tier + branch); il limite è "stessa decisione, stessa
  fermata" — decisioni indipendenti che meritano riflessioni separate non si fondono.
Lingua: chiara e breve, senza gergo interno non ancora noto a chi risponde. Se una domanda esce
lunga o contorta, non è un problema di forma: chi la pone non ha ancora capito cosa sta chiedendo.

## Tier del thread principale e escalation
Il tier dei sub-agent è garantito dal frontmatter. Nel THREAD PRINCIPALE restano l'orchestrazione
(bookkeeping: la direzione la calcola il sequencer) e l'IMPLEMENTAZIONE di un piano già approvato al
Gate 2 — lavoro da tier intermedio, non da modello top. Il default è quindi dichiarato dal progetto
(`flow.config.models.mainThread`, applicato in `.claude/settings.json` dall'install), tipicamente
intermedio; le due fasi che richiedono il modello top, specifica e piano, non dipendono da questa
scelta perché vivono in sub-agent col tier nel frontmatter.
L'implementazione resta nel thread — e non diventa un sub-agent — per tre ragioni: è un LOOP con la
Fase 3 (isolarla trasformerebbe ogni test rosso in un ripartire da freddo, cioè il rimbalzo che il
processo vuole evitare); le sue domande da Regola del 98% nascono a metà del lavoro e bloccano le
decisioni a valle, mentre quelle di una fase redazionale si enumerano prima di produrre; ed è la
fase più lunga, quella in cui l'osservazione umana in corsa vale di più.
L'ESCALATION di tier è una decisione umana, in due punti dichiarati:
- al GATE 2, informata dalle NOTE DI COMPLESSITÀ del plan-author (che segnala, non decide);
- dopo i ROSSI, proposta dal sequencer al ripetersi dei giri di test falliti (soglia
  `flow.config.models.escalateAfterRedRounds`) — un segnale oggettivo, non una stima ex-ante.
In entrambi i casi la scelta si registra (`record-override --gate model-tier --reason`): nessun
cambio di tier silenzioso, in nessuna direzione. Il tier è economia, non un presidio di correttezza:
i presidi restano gli hook, i gate e i test scritti prima del codice. Limite dichiarato: il modello
del thread è un DEFAULT di progetto, non un vincolo imponibile — l'utente può sempre cambiarlo in
sessione, e il kit non ha modo di accorgersene.

## Artefatti di knowledge-store
Il processo si appoggia a un piccolo insieme di artefatti versionati (file .md), agnostici dal tool:
- Spec Store — le specifiche approvate, in DUE PARTI: parte NORMATIVA (perimetro, modello dati,
  comportamento atteso con gli osservabili, criteri, decisioni di gate, file previsti) — che deve
  bastare da sola al test-author — e parte di MOTIVAZIONE (impact analysis, alternative, rischi).
- Changelog / Log decisioni — append-only, in DUE PARTI per voce: una testa "Vincolante" (max 15
  righe: invarianti e contratti nuovi, aree congelate, debiti, superfici nuove, misure con il
  percorso della fonte primaria) e una narrativa sotto la barriera di lettura (cosa, perché,
  alternative). Le fasi a valle leggono le sole teste.
- Documenti di architettura PER-CONTESTO — uno per ogni contesto del progetto
  (in un monorepo: un documento per app/pacchetto/servizio; in un single-repo: uno solo).
  Descrivono SOLO il sistema com'è ORA: cosa fa quel contesto, come si incastrano i pezzi,
  dove si modifica in sicurezza, quali invarianti regge. Niente storia, niente "prima era così",
  niente "attualmente": il presente è già implicito. La storia vive in git.
- Registro della documentazione — l'elenco dei documenti di progetto con il loro AMBITO
  (flow.config.documentation.docs): è ciò che la Fase 4 valuta. DICHIARATO, non inferito.
- Test-playbook — la ricetta dei test del progetto (vedi Fase 3): DICHIARATO, non inferito.

## Le 6 fasi

### Fase 0 — Intake
- Ingresso: una richiesta (CR/evolutiva o BUG) dal ticketing.
- Contract-check dei connettori PRIMA di usarli; lo stato del task viene avviato qui
  (flowState start).
- Il sub-agent intake normalizza la richiesta: tipo, priorità, riferimenti, allegati.
- Classifica CR vs BUG. Produce un "contesto richiesta" minimale.
- NON legge la codebase in questa fase (risparmio).
- Fast-path: qui si valuta SOLO la CANDIDATURA, dai segnali del ticket. La proposta vera
  richiede di aver visto il codice → Fase 1.

### Fase 1 — Definizione della specifica
- Retrieval mirato: si legge solo il necessario (skill spec-context), MAI tutta la codebase.
- PRIMA di leggere il codice di un contesto, si legge il documento di architettura di quel
  contesto. Se è in drift rispetto al codice, va segnalato SUBITO (un doc stantio è peggio di
  nessun doc).
- Il sub-agent spec-author valida la richiesta contro codebase, constraint, changelog
  (impact analysis: la richiesta rompe scelte deliberate del passato?), redige la bozza di spec
  SU FILE (`.ai-dev/tasks/<id>/spec-draft.md`) e le domande sui buchi, ognuna col proprio contesto.
  Al gate l'orchestratore presenta il sommario e il percorso, non la spec incollata.
- CONTRATTO D'INGRESSO della fase: fra gli input dello spec-author ci sono anche gli INPUT DI
  FASE 0 (`.ai-dev/tasks/<id>/inputs/`, e quelli dei task precedenti dello stesso ticket): brief
  degli stakeholder, discovery in sola lettura sul sistema sorgente, fixture grezze. Sono la fonte
  PRIMARIA delle misure: nessuna cifra si dichiara "non verificabile" senza averli aperti.
- La spec si redige in DUE PARTI: normativa (il contratto, autosufficiente per il test-author) e
  motivazione (il perché). Il changelog si legge dalle sole teste "Vincolante".
- CONTROLLO DI OSSERVABILITÀ, prima del gate: ogni clausola del comportamento atteso dichiara COME
  SI OSSERVA (quale tipo di test la coprirebbe, su cosa asserisce). Una clausola senza osservabile
  non è una clausola: è una domanda di gate. Si verifica anche la coerenza interna fra le decisioni
  di gate e le sezioni redatte prima di esse. Motivo: per il test-author di Fase 2 la spec è
  l'UNICA fonte del comportamento da testare (lavora alla cieca rispetto a codice e piano) — ciò
  che non è osservabile in Fase 1 diventa un emendamento post-gate, cioè un secondo passaggio
  completo della fase più cara.
- FAST-PATH (proposta vera): a retrieval fatto — e per i BUG dopo la riproduzione — se la
  modifica è circoscritta si propone il fast-path all'utente, spiegando cosa salta e i rischi.
  La scelta è SEMPRE umana e registrata.
- Intervista sui buchi: domande SOLO dove la spec è incompleta (Regola del 98%). Risposte nel
  registro Q&A. Quando le domande sono poche, intervista e gate si presentano in UN'UNICA FERMATA
  (ogni stop è un context switch per chi risponde); se una risposta può ribaltare la bozza,
  prima l'intervista, poi il gate.
- ► GATE UMANO 1: la persona approva la SPECIFICA (→ flowState approve-gate spec).
- Loop di raffinamento con soglie (flow.config.maxRefine: avviso e blocco).
- A spec approvata (GARANTITO dal guardiano di fine turno): salvataggio nello Spec Store
  (record-spec) + commento sul task nel ticketing via connettore (--comment) con il riferimento.
  Il commento è disattivabile PER-PROGETTO (flow.config.delivery.specTicketComment): una scelta
  stabile si dichiara una volta nella config committata, non si paga come deroga a ogni task.

### Fase 2 — Implementazione
- Il sub-agent plan-author redige il piano SU FILE (`.ai-dev/tasks/<id>/plan-draft.md`) dalla
  SPEC APPROVATA e dall'elenco dei FILE LETTI in Fase 1 (punto di partenza del suo retrieval, non
  il suo perimetro: la scoperta della codebase si paga una volta, non due) — approccio, file
  toccati con percorsi reali, ordine degli interventi, rischi, test previsti SCELTI dal playbook — più il
  CONTROLLO DI COPERTURA (ogni clausola della spec ha un intervento che la realizza; ogni
  intervento ha una clausola che lo richiede) e le NOTE DI COMPLESSITÀ implementativa.
- Il piano NON raggiunge MAI il test-author: la spec dichiara il COSA e resta la sua unica fonte
  del comportamento da testare (la ricetta dei test dice solo come si scrivono qui).
  È questa separazione a rendere strutturale l'anti teaching-to-the-test — se il COME colasse nella
  spec, i test validerebbero l'approccio scelto invece del comportamento atteso.
- ► GATE UMANO 2: la persona approva il PIANO (→ approve-gate plan). È UNA FERMATA SOLA che decide
  tre cose insieme: il piano, CON QUALE TIER implementare (informata dalle note di complessità,
  vedi "Tier del thread principale e escalation") e il BRANCH di lavoro (base + nome).
- BRANCH DI LAVORO (prima del test-author, che committa — di norma già deciso al Gate 2): si
  propone `<fix|feat>/<nome-breve-esplicativo>` (fix=BUG, feat=CR); nome custom ammesso.
  Registrato nello stato (set-branch). L'hook pre-edit-guard BLOCCA lo sviluppo senza
  spec+piano+branch e lo sviluppo sul branch base.
- In parallelo e PRIMA dell'implementazione: il sub-agent test-author scrive i test e li committa.
  Riceve la spec — UNICA fonte del comportamento da testare — più la RICETTA DEI TEST del progetto
  (test-playbook, convenzioni, testPaths, test esistenti in lettura): la ricetta dice solo COME si
  scrivono i test qui, mai cosa asserire. MAI il piano, MAI il codice di implementazione
  (isolamento strutturale, vedi Qualità).
- L'agente implementazione scrive il codice. Rispetta le convenzioni di progetto dichiarate in
  flow.config (NON le inferisce). NON può modificare i file di test (hook pre-edit-guard, anche
  via Bash: pre-bash-guard).
- Se la modifica tocca codice che produce/trasforma dati persistenti, scatta il gate
  pre-work-snapshot: lo stato "before" si cattura da codice ancora pristino. La decisione
  (cattura o skip motivato) è registrata nello stato.
- PROGETTI SENZA GIT (deroga `branch` registrata): il GATE 3 non ha un diff. All'inizio della fase,
  da codice ancora intatto, si registra il MANIFEST "prima" (`flowState.mjs record-manifest` →
  `.ai-dev/tasks/<id>/manifest-before.txt`); al gate l'inventario dei file toccati si ottiene per
  CONFRONTO (`flowState.mjs diff-manifest`), non con una ricerca a timestamp indovinato. È il
  sequencer a pretendere il manifest prima di considerare il GATE 3 approvabile. Come per lo
  snapshot sui dati, la finestra per catturarlo è mentre il codice è intatto: persa, non torna.
- ► GATE UMANO 3: revisione rapida del diff — o dell'inventario per confronto, senza git
  (→ approve-gate diff).

### Fase 3 — Qualità (test secondo il PLAYBOOK del progetto)
- Si classifica il diff (dati? frontend? API? logica?).
- Il test-selector sceglie quali test lanciare consultando il TEST-PLAYBOOK del progetto
  (flow.config.testPlaybook): per ogni tipo di test, il playbook dichiara COME si lancia
  e QUANDO si applica. Il selettore NON inventa la strategia e NON la inferisce dal codice.
- Il sub-agent test-runner ESEGUE i comandi selezionati e riporta gli esiti (fatti, non opinioni).
- Categorie generiche di default (sovrascrivibili dal playbook):
  dati/ETL → non-regression a confronto pre/post (data-diff su invarianti);
  frontend → end-to-end; API/logica → unit + integration; trasversale → combinazione;
  validazione-spec → sempre (è leggera).
- Su monorepo: il test-selector interroga il tool nativo (Turborepo/Nx --affected);
  se assente, fallback conservativo (lancia tutto l'ambito coinvolto) + avviso.
- GARANTITO: il guardiano di fine turno (hook Stop) blocca la chiusura del turno finché la
  verifica non è registrata per lo stato ATTUALE del codice coperto dal playbook — l'hash si
  calcola sul CONTENUTO dei file nei pathPatterns del test-playbook, non sull'intero diff git.
  Se quel codice cambia dopo la verifica, il gate si ri-arma da solo; doc, changelog, salvataggi
  nello Spec Store e commit NON lo ri-armano (non toccano il codice sotto test — l'hash globale
  costringeva a ri-verifiche spurie a ogni scrittura del flusso stesso). Una verifica ROSSA non lo
  soddisfa: il gate resta armato finché i test non passano. Skip solo esplicito e motivato
  (registrato).
- Se i test passano → Fase 4. Se falliscono → torna all'implementazione (fix); i test non si toccano.
- Un ROSSO è un FATTO e si registra (`record-verification --status failed`): è ciò che rende il
  rientro in implementazione visibile al sequencer invece di essere un vuoto nello stato, e ciò che
  gli fa contare i giri — da cui la proposta di escalation di tier. Registrare "done" su test rossi
  è una dichiarazione falsa nello stato, non una scorciatoia.

### Fase 4 — Documentazione
- Il sub-agent doc-author riceve spec + diff + registro documenti (flow.config.documentation.docs)
  e valuta l'IMPATTO del cambiamento su ogni documento (il mapping non è path→doc: è una
  valutazione cognitiva sull'AMBITO dichiarato).
- Aggiorna: gli architecture doc dei contesti la cui struttura/invarianti sono cambiate; i
  documenti di progetto impattati; il CHANGELOG in due parti — testa "Vincolante" (tetto duro di
  15 righe: solo ciò che vincola i task futuri, misure con il percorso della fonte primaria) e
  narrativa sotto la barriera di lettura (la scelta fatta e il perché, per intero). La testa è
  l'unica parte che le impact analysis future rileggono: se cresce, cresce il costo di ogni task
  successivo.
- "Nessun documento impattato, perché…" è un esito valido; il silenzio no.
- GARANTITO: il guardiano di fine turno non lascia chiudere senza doc-review e changelog
  registrati (o skip esplicito dell'utente).

### Fase 5 — Consegna
- PR dal branch di lavoro verso il branch base registrato nello stato (titolo dalla spec, corpo
  con link a spec e changelog, riferimento al ticket).
- PROGETTI SENZA GIT (deroga `branch` registrata): non c'è PR da proporre, quindi il passo si salta
  e la consegna è il solo aggiornamento del ticket — che resta pretesa dal sequencer, prendendo il
  changelog come riferimento temporale al posto della PR.
- Aggiornamento stato del task nel ticketing via connettore (--update-status: Review/Done — lo
  stato di arrivo lo dice `flow.config.delivery.ticketStatus` se valorizzato, senza domanda;
  altrimenti lo sceglie la persona) — GARANTITO dal guardiano di fine turno.
- I passi di consegna sono configurabili PER-PROGETTO (flow.config.delivery: specTicketComment,
  pr, ticketUpdate): un progetto che non usa PR o non aggiorna il ticket lo DICHIARA nella config
  committata — la stessa deroga ripetuta a ogni task è un difetto di configurazione, non una
  decisione.
- Chiusura dello stato del task (flowState close).

## Ramo BUG (variante della Fase 1-2)
- Riproduzione del bug (l'AI isola il caso minimo, usa il changelog per l'origine) — PRIMA della
  spec e della valutazione fast-path.
- Test che FALLISCE (red) che cattura il bug.
- Dopo la fix: lo stesso test passa (green). Il red-test entra stabilmente nella suite di non-regression.

## Fast-path (task piccoli)
- Fase 0: solo CANDIDATURA (segnali del ticket). Fase 1, a retrieval fatto (e riproduzione per i
  BUG): PROPOSTA vera, con criteri verificati sul codice (modifica circoscritta, no schema dati,
  no API pubbliche, soglia righe in flow.config.fastPath).
- Cosa taglia (i sub-agent, mai i gate): NIENTE plan-author — il piano compresso è nella spec
  approvata (file previsti, approccio) e si presenta comunque al Gate 2; NIENTE test-author
  separato — in Fase 3 girano i test del playbook; doc-review IN LINEA dall'orchestratore
  (registrazione comunque obbligatoria: "nessun impatto, perché…" è un esito valido).
  Un fast-path che taglia solo il test-author non è un fast-path: il costo fisso di un task
  piccolo sta nei sub-agent redazionali.
- Se durante il piano compresso emerge che la modifica NON è più circoscritta, si rientra nel
  percorso completo (plan-author): il fast-path è una scommessa revocabile, non un binario.
- Il sistema SI FERMA e chiede alla persona, spiegando cosa salta e i rischi. La scelta è
  registrata nello stato (record-override).
- La persona può sempre forzare il percorso completo su un singolo task. I TRE GATE UMANI restano
  in ogni caso.

## I tre gate umani (riepilogo)
1. Specifica  2. Piano  3. Revisione rapida del diff.
La persona resta il decisore. Nessun gate è saltato senza una scelta esplicita, e ogni
approvazione/deroga è registrata nello stato del task.

## Perimetro dello standard
Nei progetti dove il kit è installato si usano SOLO plugin, skill, MCP e connettori installati
dal kit (più Ponytail, abilitato dal kit stesso, e le whitelist esplicite di
flow.config.perimeter). L'hook di perimetro BLOCCA il resto: il flusso deve essere identico per
chiunque apra il progetto. Whitelistare un componente è una decisione umana, committata.

## Garanzia di qualità (anti teaching-to-the-test)
I test sono scritti da un sub-agent isolato PRIMA del codice e committati prima
dell'implementazione. L'isolamento è sul COME della soluzione: il test-author riceve la spec
(unica fonte di ciò che va asserito) e la RICETTA dei test del progetto (playbook, convenzioni,
posizione e stile dei test esistenti) — MAI il piano né il codice di implementazione. La ricetta
non rivela nulla della soluzione: farla riscoprire a ogni task era un costo, non un presidio.
Gli hook pre-edit-guard e pre-bash-guard rendono i test read-only per l'agente implementatore
(anche via shell). L'isolamento è verificabile (git timestamp + hook).

## Snapshot "before" per le modifiche ai dati
Per le modifiche che toccano codice produttore di dati, la prova di non-regressione richiede
un confronto pre/post sugli stessi dati. Lo stato "before" va catturato MENTRE il codice è
ancora pristino: per questo il gate pre-work-snapshot scatta alla PRIMA modifica di quel tipo
e chiede all'utente se catturare ora lo snapshot o saltarlo (scelta umana, registrata nello
stato del task).
