# AI-Dev Flow — Processo
process-version: 0.0.7
compatibile-con: ">=0.0.1 <0.1.0"

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

## Agenti per fase (modello per fase)
Il lavoro cognitivo di ogni fase è svolto da un sub-agent dedicato, eseguito col modello adatto
alla natura della fase (qualità dove serve, economia dove basta). L'isolamento è anche un
contratto: un sub-agent riceve SOLO i suoi input dichiarati, non la conversazione.
- intake (Fase 0) → modello economico: normalizzazione meccanica.
- spec-author (Fase 1) → modello top: la fase a più leverage.
- test-author (Fase 2) → modello top: deriva i test dal contratto, isolato (riceve SOLO la spec).
- test-runner (Fase 3) → modello economico: esegue comandi e riporta esiti.
- doc-author (Fase 4) → modello intermedio: scrittura fedele su input dichiarati.
I gate umani restano SEMPRE nell'orchestratore (skill flow): gli agenti preparano, l'utente decide.

## Artefatti di knowledge-store
Il processo si appoggia a un piccolo insieme di artefatti versionati (file .md), agnostici dal tool:
- Spec Store — le specifiche approvate.
- Changelog / Log decisioni — cosa è stato fatto e perché (append-only).
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
  e le domande sui buchi.
- FAST-PATH (proposta vera): a retrieval fatto — e per i BUG dopo la riproduzione — se la
  modifica è circoscritta si propone il fast-path all'utente, spiegando cosa salta e i rischi.
  La scelta è SEMPRE umana e registrata.
- Intervista sui buchi: domande SOLO dove la spec è incompleta (Regola del 98%). Risposte nel
  registro Q&A.
- ► GATE UMANO 1: la persona approva la SPECIFICA (→ flowState approve-gate spec).
- Loop di raffinamento con soglie (flow.config.maxRefine: avviso e blocco).
- A spec approvata (GARANTITO dal guardiano di fine turno): salvataggio nello Spec Store
  (record-spec) + commento sul task nel ticketing via connettore (--comment) con il riferimento.

### Fase 2 — Implementazione
- Il piano viene proposto (approccio, file toccati, rischi).
- ► GATE UMANO 2: la persona approva il PIANO (→ approve-gate plan).
- BRANCH DI LAVORO (prima del test-author, che committa): si chiede da quale branch staccare e
  si propone `<fix|feat>/<nome-breve-esplicativo>` (fix=BUG, feat=CR); nome custom ammesso.
  Registrato nello stato (set-branch). L'hook pre-edit-guard BLOCCA lo sviluppo senza
  spec+piano+branch e lo sviluppo sul branch base.
- In parallelo e PRIMA dell'implementazione: il sub-agent test-author scrive i test ricevendo
  SOLO la spec e li committa (isolamento strutturale, vedi Qualità).
- L'agente implementazione scrive il codice. Rispetta le convenzioni di progetto dichiarate in
  flow.config (NON le inferisce). NON può modificare i file di test (hook pre-edit-guard, anche
  via Bash: pre-bash-guard).
- Se la modifica tocca codice che produce/trasforma dati persistenti, scatta il gate
  pre-work-snapshot: lo stato "before" si cattura da codice ancora pristino. La decisione
  (cattura o skip motivato) è registrata nello stato.
- ► GATE UMANO 3: revisione rapida del diff (→ approve-gate diff).

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
  verifica non è registrata per ESATTAMENTE il diff corrente (hash); se il codice cambia dopo
  la verifica, il gate si ri-arma da solo. Skip solo esplicito e motivato (registrato).
- Se i test passano → Fase 4. Se falliscono → torna all'implementazione (fix); i test non si toccano.

### Fase 4 — Documentazione
- Il sub-agent doc-author riceve spec + diff + registro documenti (flow.config.documentation.docs)
  e valuta l'IMPATTO del cambiamento su ogni documento (il mapping non è path→doc: è una
  valutazione cognitiva sull'AMBITO dichiarato).
- Aggiorna: gli architecture doc dei contesti la cui struttura/invarianti sono cambiate; i
  documenti di progetto impattati; il CHANGELOG (la scelta fatta e il perché — alimenta le
  impact analysis future).
- "Nessun documento impattato, perché…" è un esito valido; il silenzio no.
- GARANTITO: il guardiano di fine turno non lascia chiudere senza doc-review e changelog
  registrati (o skip esplicito dell'utente).

### Fase 5 — Consegna
- PR dal branch di lavoro verso il branch base registrato nello stato (titolo dalla spec, corpo
  con link a spec e changelog, riferimento al ticket).
- Aggiornamento stato del task nel ticketing via connettore (--update-status: Review/Done —
  lo stato di arrivo lo sceglie la persona) — GARANTITO dal guardiano di fine turno.
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
- Il sistema SI FERMA e chiede alla persona, spiegando cosa significa (skip impact-analysis e
  skip sub-agent test separato) e i rischi. La scelta è registrata nello stato (record-override).
- La persona può sempre forzare il percorso completo su un singolo task.

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
I test sono scritti da un sub-agent isolato che riceve solo la spec, PRIMA del codice,
e committati prima dell'implementazione. Gli hook pre-edit-guard e pre-bash-guard li rendono
read-only per l'agente implementatore (anche via shell). L'isolamento è verificabile
(git timestamp + hook).

## Snapshot "before" per le modifiche ai dati
Per le modifiche che toccano codice produttore di dati, la prova di non-regressione richiede
un confronto pre/post sugli stessi dati. Lo stato "before" va catturato MENTRE il codice è
ancora pristino: per questo il gate pre-work-snapshot scatta alla PRIMA modifica di quel tipo
e chiede all'utente se catturare ora lo snapshot o saltarlo (scelta umana, registrata nello
stato del task).
