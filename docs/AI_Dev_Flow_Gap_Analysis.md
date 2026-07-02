# AI-Dev Flow — Gap Analysis

> **STATO: CHIUSA — implementata nella 0.0.7** (2026-07-02). Tutti i gap implementabili
> (GAP-01…10, 12…16) sono stati chiusi nel rilascio 0.0.7; GAP-11 (istruttoria MCP) resta una
> decisione aperta con criteri definiti; i punti della sezione 5 restano parcheggiati.
> Il documento è conservato come razionale delle scelte della 0.0.7.

> Analisi dei buchi tra il processo dichiarato (drawio V4 + `PROCESS.md` + manuale) e
> l'implementazione reale (kit 0.0.6), integrata con il feedback di revisione del 2026-07-02.
> Ogni gap ha: descrizione, impatto sulla standardizzazione, severità e una **proposta di
> soluzione** da validare punto per punto. Le proposte sono progettuali: nessuna è implementata
> finché non viene approvata.
>
> Scala di severità: **Critico** (mina la promessa fondante dello standard) · **Alto** (garanzia
> importante assente o aggirabile) · **Medio** (incoerenza di design o attrito) · **Basso**
> (miglioria/igiene).

---

## 0. Il tema portante: standardizzato = deterministico

Quasi tutti i gap critici hanno la stessa radice, ed è il punto sollevato come IMPORTANTISSIMO in
revisione: **troppe operazioni di processo sono prescritte all'agente invece che garantite dal
sistema**. Un'istruzione in una skill ("aggiorna il task su Productive") viene eseguita *quasi*
sempre; un hook viene eseguito *sempre*. Su cento task, "quasi sempre" significa flussi diversi tra
sviluppatori diversi — l'esatto contrario di uno standard.

Il criterio guida proposto per tutte le soluzioni che seguono:

> **Ciò che è meccanico lo fa un hook o uno script (deterministico). Ciò che è cognitivo lo fa
> l'agente. Ciò che è una decisione la prende l'umano. Ogni deroga (skip) è esplicita e registrata,
> quindi auditabile.**

L'infrastruttura abilitante è una sola, e ricorre in quasi tutte le proposte: una **macchina a
stati per-task** (GAP-01). Oggi l'unico "stato" del flusso sono marcatori effimeri in `/tmp`,
per-sessione; non esiste da nessuna parte la risposta alla domanda "a che punto è questo task, e
cosa è già stato fatto?". Senza quella risposta, nessun hook può far rispettare i contratti di fase.

---

## 1. Gap critici

### GAP-01 — Le operazioni di fine fase sono affidate alla disciplina dell'agente
**Origine**: feedback (IMPORTANTISSIMO) + drawio V4 (`on-spec-approved`, `post-implementation`,
`on-tests-green` non hanno eventi nativi) + analisi.

**Descrizione.** Sono agent-driven, cioè non garantite: il salvataggio della spec nello Spec Store
e l'aggiornamento del task a fine Fase 1; l'impact analysis sul changelog; l'esecuzione effettiva
dei test selezionati in Fase 3 (il `test-selector` seleziona soltanto); l'aggiornamento di
changelog e documentazione in Fase 4; l'aggiornamento di stato del ticket in chiusura. Se l'agente
"si dimentica", il flusso degrada in silenzio.

**Impatto.** È il gap che decide se AI-Dev Flow è uno standard o una buona abitudine. Severità:
**Critico**.

**Proposta.**
1. Introdurre lo **stato per-task**: `.ai-dev/tasks/<ticket-id>/state.json`, persistente nel
   progetto (non in `/tmp`), che registra: fase corrente, gate approvati (con timestamp), artefatti
   prodotti (path della spec, branch di lavoro, snapshot catturato/saltato, test eseguiti + esito,
   voce di changelog, doc aggiornate, ticket aggiornato) e ogni **skip esplicito** con motivazione.
2. Gli hook diventano i **guardiani dei contratti di fase**, leggendo lo stato:
   - `PreToolUse` su Edit/Write di sorgenti: bloccato se lo stato non registra spec approvata,
     piano approvato e branch di lavoro (con deroga umana esplicita, registrata).
   - `PostToolUse` su Write in `.ai-dev/specs/**`: scatta la registrazione della spec nello stato
     **e l'aggiornamento del ticket via connettore, eseguito dall'hook stesso** (è un'operazione
     meccanica: API call — non serve l'agente; richiede GAP-02).
   - `Stop` esteso a **checklist di chiusura**: se lo stato dice "fase implementazione conclusa" ma
     mancano test eseguiti / changelog / doc / ticket, blocca il turno con l'elenco di ciò che
     manca, finché tutto è fatto o esplicitamente saltato dall'umano (skip nello stato).
3. La transizione di fase è **una scrittura nello stato**, non un concetto implicito: così ogni
   fase ha un momento verificabile in cui il suo contratto viene controllato.

**Benefici collaterali** (emersi in revisione): lo stato persistente rende il flusso
**riprendibile** — un ticket interrotto riparte da dov'era invece che da zero — e **passabile di
mano**: uno sviluppatore porta il task fino alla spec approvata, un collega apre il progetto e lo
stato gli dice esattamente dov'è e cosa manca.

**Contenere la complessità** (il rischio vero, sollevato in revisione: manutenibilità e rapporto
col `migrate`). La paura è fondata se lo stato diventa un workflow engine; la mitigazione è
impedirgli di diventarlo, con cinque regole di design:
1. **Registro di fatti, non motore.** Lo stato non "esegue" nulla: è una checklist persistita
   (fase, gate, artefatti, skip). La logica resta negli hook e nelle skill; se domani il flusso
   cambia, cambia la logica, non il formato dei fatti. Un ledger di fatti invecchia molto meglio
   di una definizione di workflow.
2. **Schema minimo, piatto, versionato.** Si parte con i soli campi che servono ai gate
   dell'ondata 1; ogni campo nuovo deve avere un hook/skill che lo consuma, altrimenti non entra.
   Il file porta un `stateVersion`.
3. **Un solo punto di lettura/scrittura.** Una piccola libreria (`bin/flowState.mjs`) usata da
   tutti gli hook e le skill: nessuno parsa o scrive il JSON per conto suo. La manutenzione è un
   file, non dieci.
4. **Il migrate lo copre già.** Lo stato è un artefatto per-progetto come `flow.config.json`: se
   una versione del kit ne cambia il formato, la migrazione `<from>-to-<to>.mjs` lo trasforma con
   lo stesso meccanismo transazionale esistente. Nessuna infrastruttura nuova.
5. **Deve essere sacrificabile.** Lo stato *punta* agli artefatti (spec, branch, changelog), non li
   contiene: non c'è mai lavoro dentro. Nel caso peggiore (corrotto, incoerente dopo un upgrade) si
   ricostruisce con un comando di recovery che rilegge gli artefatti reali e ri-deduce i fatti
   certi, chiedendo all'umano solo i gate non deducibili. Un sistema il cui stato si può buttare e
   rigenerare non può tenerti in ostaggio.
Con queste regole il costo di manutenzione stimato è: uno schema JSON documentato, una libreria
piccola, e l'estensione dei 4 hook esistenti — non un sottosistema.

**Dipendenze**: GAP-02 (per gli update meccanici al ticketing), GAP-05/06/07 la riusano.

### GAP-02 — I connettori non sanno scrivere: l'aggiornamento del ticket non è nemmeno possibile in modo deterministico
**Origine**: analisi (verificato nel codice) + drawio V4 (che dichiara «MCP: Productive (write task
ref)» e «Update Task Status → Done/Review»).

**Descrizione.** `productive.mjs` e `zammad.mjs` sono **read-only** (lettura ticket + download
allegati + probe `--check`). Il flusso prescrive di aggiornare il task a fine Fase 1 e in chiusura,
ma non esiste un comando per farlo: oggi l'agente dovrebbe improvvisare chiamate API ad hoc — il
peggio possibile per uno standard (né garantito, né uniforme).

**Impatto.** Blocca la parte più facile da rendere deterministica del GAP-01. Severità: **Critico**
(come prerequisito).

**Proposta.** Estendere il contratto dei connettori con operazioni di scrittura uniformi:
`--update-status <id> <stato>`, `--comment <id> <testo>` (per il link alla spec / alla PR).
Il contract-check (`check.mjs`) valida anche queste. A quel punto gli aggiornamenti del ticketing
diventano side-effect di hook/script (GAP-01), identici per chiunque.

---

## 2. Gap alti

### GAP-03 — Il vincolo "solo componenti del kit" non è enforced
**Origine**: feedback (già dichiarato come gap nel manuale, §2).

**Descrizione.** Lo standard prescrive che nei progetti col kit si usino solo plugin/skill/MCP
installati dal kit (unica eccezione: Ponytail, abilitato dal kit stesso). Oggi è una norma scritta:
niente impedisce a una skill personale o a un MCP utente di entrare nel flusso.

**Impatto.** Perimetro degli strumenti diverso per sviluppatore = flusso non ripetibile. Severità:
**Alto**.

**Proposta.**
1. `flow.config.json` dichiara la **whitelist** dei componenti ammessi (i connettori del kit, le
   skill del kit, Ponytail).
2. Hook `PreToolUse` con matcher sui tool MCP (`mcp__*`): blocca ogni server MCP non in whitelist.
   Stesso approccio sul tool `Skill` (bloccare skill il cui nome non è del kit).
3. L'install scrive nel `.claude/settings.json` di progetto anche `permissions.deny` per le
   categorie note di tool esterni, come seconda linea.
4. Il doctor verifica la presenza dell'enforcement.

*Nota di fattibilità da verificare in implementazione*: che l'evento PreToolUse esponga il nome
della skill invocata e che i tool MCP siano intercettabili col matcher — da provare su Claude Code
corrente prima di considerare chiuso il design.

### GAP-04 — L'anti teaching-to-the-test è aggirabile via Bash
**Origine**: analisi (+ feedback: «preEditGuard da verificare»).

**Descrizione.** `preEditGuard` intercetta solo `Edit|Write|MultiEdit|NotebookEdit`. Un file di
test è modificabile senza blocco passando da **Bash** (`sed -i`, redirection, `tee`, `mv`). La
garanzia "i test sono read-only per l'implementatore" — il pilastro verificabile del processo — ha
quindi una porta laterale aperta. (Per il resto lo script è corretto: matching glob su
`testPaths`, eccezione via marcatore del test-author.)

**Impatto.** La garanzia più venduta dello standard non è strutturale come dichiarato. Severità:
**Alto**.

**Proposta.** Aggiungere in `hooks.json` un matcher `Bash` con uno script che ispeziona il comando
e blocca i pattern di scrittura verso path che matchano `testPaths` (redirection `>`/`>>`,
`sed -i`, `tee`, `cp/mv` con destinazione test, `rm`). L'euristica non sarà perfetta (va detto
onestamente nel manuale), ma chiude i vettori comuni; il doctor estende il test funzionale del
Passo 5 anche al vettore Bash.

### GAP-05 — Lo stato dei gate è effimero, per-sessione e non auditabile (e il gate di verifica non si ri-arma)
**Origine**: analisi + feedback (irrobustire con hook).

**Descrizione.** Tre difetti dello stesso meccanismo:
1. I marcatori (`/tmp/aidevflow-*-<sessionId>`) sono **per-sessione ed effimeri**: nuova sessione =
   gate ri-armati anche se già gestiti per quel task; riavvio = stato perso; nessuna traccia di chi
   ha saltato cosa.
2. Il marcatore di verifica post-work viene ri-armato **solo** da modifiche a `dataProducingPaths`
   (`preWorkSnapshot` lo rimuove in quel caso): se dopo una verifica eseguita modifichi codice
   frontend o API, il gate **non** si ri-arma e il turno può chiudersi senza ri-verifica.
3. Lo "skip" della verifica o dello snapshot non è registrato da nessuna parte: `touch` del
   marcatore e nessuna differenza tra "verificato" e "saltato".

**Impatto.** I due hook più importanti proteggono meno di quanto sembri. Severità: **Alto**.

**Proposta.** Assorbito dalla macchina a stati (GAP-01): i gate leggono/scrivono
`.ai-dev/tasks/<id>/state.json` con scope per-task; il gate di verifica si ri-arma a **ogni**
modifica successiva all'ultima verifica (confronto con l'hash del diff verificato, non col tipo di
path); ogni esito distingue `done` da `skipped` (+ motivazione). I marcatori `/tmp` restano solo
come cache anti-nag intra-sessione.

### GAP-06 — Manca il branching (e senza branch niente PR)
**Origine**: feedback (requisito nuovo).

**Descrizione.** Il flusso non prevede la creazione di un branch di lavoro: gli sviluppi (e i
commit del test-author!) avvengono sul branch corrente, chiunque esso sia.

**Impatto.** Igiene di base assente + prerequisito della Fase 5 (PR). Severità: **Alto**.

**Proposta.**
1. **Dopo il Gate 2 (piano approvato) e PRIMA del test-author** — perché il test-author committa, e
   quei commit devono già stare sul branch giusto — il flusso: chiede da quale branch staccare
   (default: il branch di default del repo), propone un nome convenzionale
   **`<fix|feat>/<nome-breve-ma-esplicativo>`** (`fix/` per i BUG, `feat/` per le CR; il nome breve
   derivato dal titolo della spec, es. `feat/export-csv-ordini`; pattern configurabile in
   `flow.config.branching.namePattern`), accetta un nome custom, crea il branch e lo **registra
   nello stato del task**.
2. Enforcement: hook `PreToolUse` che blocca la scrittura di sorgenti se il branch corrente è il
   branch base registrato (niente sviluppo diretto su main) — deroga umana esplicita possibile e
   registrata.
3. In Fase 5, la PR si apre dal branch registrato verso il branch da cui è stato staccato
   (anch'esso nello stato) — vedi GAP-07.

### GAP-07 — La Fase 4 non aggiorna la "vera" documentazione, e la chiusura va ristrutturata (F4 doc · F5 PR+ticket)
**Origine**: feedback + buco originario (il drawio V4 dichiara «on-tests-green → trigger doc +
changelog», mai implementato).

**Descrizione.** Oggi la "documentazione" di Fase 4 è changelog + architecture doc, entrambi
affidati all'agente; la documentazione di progetto vera e propria (docs/ funzionale ecc.) non è
contemplata; e l'aggiornamento del ticket convive nella stessa fase con la documentazione.

**Impatto.** La documentazione — il motivo per cui il knowledge-store funziona — è il pezzo meno
garantito del flusso. Severità: **Alto**.

**Proposta.** Ristrutturazione approvata in revisione:
- **Fase 4 — Documentazione**: architecture doc dei contesti toccati + documentazione di progetto
  + changelog. Il meccanismo qui è volutamente **diverso dal test-playbook**: per i test il legame
  path→comando è naturale, per la documentazione un mapping rigido path→documento sarebbe falso
  (la doc non rispecchia la struttura dei file, e una modifica può impattare un documento che
  "vive" altrove). Quindi due livelli:
  1. Un **registro dei documenti** (`flow.config.documentation.docs[]`): l'elenco dei documenti di
     progetto con una descrizione del loro *ambito* («`docs/api.md` — i contratti REST esposti»,
     «`docs/onboarding.md` — come si avvia l'ambiente») e, dove esiste davvero, un *hint* opzionale
     di path. Popolato in intervista, mantenuto con `flow-settings`.
  2. In chiusura, la **valutazione di impatto sulla doc è un passo cognitivo dell'agente**: legge il
     registro, confronta con ciò che il task ha cambiato e propone quali documenti vanno rivisti
     (anche nessuno, motivando). Ciò che è **garantito dall'hook** (GAP-01) non è "quale documento"
     ma **che la valutazione avvenga e sia registrata**: lo stato del task deve contenere l'esito
     doc-review (`documenti aggiornati: […]` / `nessun impatto, perché…` / `saltato dall'utente`),
     altrimenti la chiusura è bloccata. Deterministico il *che*, cognitivo il *quale*, umano
     l'eventuale skip.
  3. Il lavoro cognitivo della fase lo svolge un **sub-agent dedicato `doc-author`**
     (`agents/doc-author.md`), sul modello del test-author (richiesto in revisione; vedi GAP-16 per
     il principio generale). Riceve un contratto d'ingresso esplicito e minimo: la spec, il diff
     finale, il registro dei documenti e le voci di changelog pertinenti — **non** la conversazione
     dell'implementatore. Il vantaggio non è solo la specializzazione (e il modello dedicato):
     documenta ciò che il codice *è diventato* leggendo diff e spec, non ciò che l'implementatore
     *racconta di aver fatto* — meno bias, tono uniforme della doc tra task e sviluppatori diversi.
     Produce: aggiornamenti proposti ai documenti impattati + la voce di changelog; l'orchestratore
     li presenta e registra l'esito nello stato.
- **Fase 5 — Consegna**: proposta di **PR** dal branch di lavoro verso il branch base (titolo/corpo
  generati da spec + changelog, link al ticket) + **aggiornamento del ticket** (Done/Review) via
  connettore in scrittura (GAP-02), eseguito in modo deterministico.
- Conseguenza documentale: PROCESS.md, il manuale e il drawio passano a **sei fasi (0–5)**
  (GAP-12).

---

## 3. Gap medi

### GAP-08 — Il fast-path viene valutato in Fase 0, che per contratto non legge la codebase
**Origine**: feedback (ragionamento confermato dall'analisi).

**Descrizione.** I criteri di eleggibilità («modifica circoscritta a un singolo file/area, nessun
cambio di schema, nessun impatto su API») **non sono accertabili senza guardare il codice** — e la
Fase 0 il codice non lo guarda, giustamente. Oggi la valutazione è al massimo una congettura sul
testo del ticket. Anche `fastPath.thresholdLines` (soglia in righe) è inapplicabile in F0: le righe
toccate non le puoi sapere prima.

**Impatto.** Incoerenza interna del design; rischio di fast-path proposti a sproposito. Severità:
**Medio**.

**Proposta.** Spezzare il concetto in due momenti: in **Fase 0** l'intake può solo marcare il task
come *candidato* fast-path su segnali del ticket (etichette, dichiarazioni del richiedente) — un
sospetto, non una proposta. La **proposta reale** avviene a inizio Fase 1, dopo il retrieval mirato
di `spec-context` (che è comunque leggero) e, per i BUG, **dopo la riproduzione**: solo lì si sa
davvero quanto codice viene toccato. La soglia in righe si applica in quel punto. PROCESS.md e
manuale da aggiornare di conseguenza.

### GAP-09 — versionDrift: registrato e corretto, ma invisibile all'utente
**Origine**: feedback («non funziona quando creo una nuova sessione») + verifica del codice.

**Descrizione.** L'hook **è** agganciato a `SessionStart` in `hooks.json` e lo script è corretto.
Il punto è il canale: lo stdout di un hook SessionStart viene **iniettato nel contesto
dell'agente**, non mostrato a te — e il messaggio dice letteralmente «Suggerisci all'utente di
eseguire migrate». Se l'agente non lo riferisce, per te l'hook "non ha funzionato". È la stessa
malattia del GAP-01: l'ultimo miglio è discrezionale. (Restano da escludere in riproduzione i casi
banali: progetto di test senza `flow.lock.json`, o versione installata già pari alla corrente —
in entrambi il silenzio è il comportamento corretto.)

**Impatto.** Il drift-notice, unico promemoria di migrazione, è inaffidabile. Severità: **Medio**.

**Proposta.** Far emettere allo script l'output JSON degli hook con `systemMessage` (mostrato
direttamente a te, senza passare dall'agente) oltre al testo nel contesto. Aggiungere una
riproduzione al doctor. Da lì si valida anche il funzionamento reale su nuova sessione.

### GAP-10 — Nessun entrypoint unico: l'orchestrazione tra le fasi è a discrezione dell'agente
**Origine**: feedback (domanda: «ha senso una sola skill intake e il resto nascosto?»).

**Descrizione.** L'utente lancia di fatto solo l'intake; le altre skill le invoca l'agente quando
"si ricorda". Non esiste un componente che dichiari la sequenza e sappia a che punto sei.

**Impatto.** Il flusso può divergere tra sessioni e sviluppatori. Severità: **Medio** (il danno
grosso è coperto da GAP-01; qui si parla di ergonomia e chiarezza).

**Proposta** (risposta ragionata alla domanda della revisione): **no alla mega-skill unica, sì a un
entrypoint unico sopra skill che restano modulari.**
- Una skill `flow` (o `task`) come **unico comando utente**: «lavora sul ticket X» → legge lo stato
  del task, sa in che fase sei, invoca la skill di processo giusta e dichiara le transizioni.
- Le skill di processo **restano separate** perché: si caricano solo quando servono (token), sono
  versionabili e testabili singolarmente, e alcune hanno **uso standalone legittimo**:
  `test-selector` dopo una modifica fatta a mano, `connectors-check` in qualsiasi momento,
  `spec-context` per pura esplorazione. Le altre no, per costruzione: `impl-runbook` senza spec e
  piano approvati non ha input validi, e infatti il loro contratto d'ingresso (manuale, §5) lo
  vieta — con lo stato per-task (GAP-01) il divieto diventa verificabile invece che dichiarato.
- Il rischio della fusione in una skill sola sarebbe: contesto enorme sempre caricato, nessun
  riuso parziale, evoluzione monolitica. Il rischio dell'assetto attuale (skill sciolte senza
  orchestratore) è quello che hai visto: discrezionalità. L'entrypoint + stato prende il buono di
  entrambi.

### GAP-11 — Connettore Productive custom invece di un MCP
**Origine**: feedback.

**Descrizione.** Il ticketing è integrato con uno script REST custom mentre l'ecosistema MCP offre
(o potrebbe offrire) connettori pronti.

**Impatto.** Costo di manutenzione interno vs dipendenza esterna. Severità: **Medio**.

**Proposta.** Decisione da istruire, non scontata. Elementi a favore dello script attuale: contratto
di output normalizzato e verificabile (`contract.schema.json` + contract-check), superficie minima
(un comando, zero tool permanenti nel contesto dell'agente), download allegati già funzionante, e il
vincolo di perimetro (GAP-03) più facile da garantire. Elementi a favore dell'MCP: manutenzione
delegata, copertura API più ampia (utile per le scritture del GAP-02 senza implementarle noi).
Criterio proposto: **si migra a MCP solo se** esiste un server mantenuto (idealmente dal vendor)
che copra lettura + allegati + aggiornamento stato/commenti; e comunque **dietro la stessa
interfaccia-contratto** (l'MCP diventa il trasporto, l'output normalizzato resta), così il flusso
non cambia. Primo passo: censimento dell'offerta MCP reale per Productive e Zammad (verifica da
fare online, non inclusa in questa analisi).

### GAP-12 — Il drawio V4 dichiara componenti che non esistono, e la struttura delle fasi cambierà
**Origine**: analisi + conseguenza delle decisioni di revisione.

**Descrizione.** Nel diagramma compaiono: «MCP: codebase index / ricerca semantica» (non esiste;
`spec-context` dice "se presente"), «MCP: read Spec Store» (lo Spec Store è una cartella, non un
MCP), gli hook `on-spec-approved` / `post-implementation` / `on-tests-green` (non esistono come
eventi; GAP-01). Inoltre le decisioni di questa revisione (F4 doc / F5 PR+ticket, branching,
fast-path spostato) rendono il diagramma e PROCESS.md strutturalmente da aggiornare.

**Impatto.** Il diagramma è il materiale con cui il processo viene presentato: se promette
meccanismi inesistenti, mina la credibilità dello standard. Severità: **Medio**.

**Proposta.** Dopo la validazione di questa gap analysis: aggiornare in un colpo solo drawio (V5),
PROCESS.md e manuale alla struttura a sei fasi con i meccanismi reali (stato + hook), etichettando
esplicitamente ciò che è deterministico e ciò che è cognitivo.

---

## 4. Gap bassi

### GAP-13 — Il doctor esiste solo dentro l'install
**Descrizione.** La verifica di salute (hook funzionanti, playbook non vuoto, contract-check,
architecture doc per contesto) gira solo come Passo 5 dell'installazione. Non c'è modo standard di
rilanciarla su un progetto già installato («è tutto ancora a posto?»).
**Proposta.** Skill `doctor` standalone che riusa il Passo 5, estesa ai check nuovi (enforcement
perimetro, stato per-task coerente, guard Bash). Severità: **Basso**.

### GAP-14 — Il manuale non aveva il riferimento dei parametri di configurazione
**Descrizione.** Richiesto in revisione. **Risolto contestualmente a questa analisi**: aggiunta
l'Appendice A al manuale con tutte le chiavi di `flow.config.json`, default, effetti e chi le legge.
Da estendere quando la config crescerà (branching, doc-playbook, whitelist perimetro). Severità:
**Basso** (chiuso, da mantenere).

---

## 4-bis. Gap emersi in validazione

### GAP-15 — Disattivare la telemetria da `flow.config` non è operativo
**Origine**: validazione dell'Appendice A (revisione 2026-07-02).

**Descrizione.** Il blocco `flow.config.telemetry` è solo la *sorgente di intento* letta
dall'install per generare i blocchi OTEL reali in `.envrc` e `.claude/settings.json` — ciò che
attiva davvero la telemetria al lancio di `claude`. Ma **nessun meccanismo riallinea i due livelli
dopo l'install**: impostare `telemetry.enabled = false` (come il README suggerisce) non rimuove il
blocco dal `.envrc`, quindi la telemetria continua a girare. Il contrario del comportamento atteso,
su un tema — la raccolta dati non anonima — dove la fiducia conta.

**Impatto.** Config e realtà possono divergere silenziosamente; l'utente crede di aver spento ciò
che è acceso. Severità: **Medio**.

**Proposta.** Rendere `flow-settings` capace di **rigenerare/rimuovere i blocchi OTEL** quando
tocca `telemetry.*` (riusando le funzioni dell'install/uninstall, che già sanno scrivere e
rimuovere i blocchi marcati). Il doctor aggiunge un check di coerenza: se `enabled=false` ma il
blocco `.envrc` esiste (o viceversa), AVVISO con azione correttiva. Documentazione allineata
(Appendice A del manuale già corretta in questo senso).

### GAP-16 — Un agente specializzato per fase, con modello per fase
**Origine**: revisione (requisito nuovo).

**Descrizione.** Oggi l'unico sub-agent è il `test-author`; tutto il resto del lavoro cognitivo
(intake, spec, piano, implementazione, doc) lo svolge l'agente principale, con un unico modello e
trascinandosi tutto il contesto della conversazione da una fase all'altra. Il requisito: ogni fase
(dove ha senso) deve poter essere svolta da un **agente dedicato e specializzato**, eseguibile con
un **modello diverso** — quello più adatto alla natura della fase, anche per ottimizzare i costi
(niente modelli "carrozzati" per lavoro meccanico).

**Fattibilità.** Alta, ed è infrastruttura già usata dal kit: gli agenti del plugin sono file in
`agents/` (auto-scoperti, come `test-author.md`) e il frontmatter di un agente Claude Code supporta
nativamente il campo **`model`** (alias di tier: `haiku`/`sonnet`/`opus`, o `inherit`). Non serve
alcun meccanismo nuovo: servono le definizioni degli agenti e la disciplina dei contratti — che
abbiamo già progettato.

**Perché rafforza lo standard (non è solo un'ottimizzazione).** Un sub-agent non vede la
conversazione: riceve **solo ciò che gli viene passato**. Questo trasforma i contratti di fase da
prescrizione a realtà fisica — il `spec-author` riceve il contesto richiesta e gli architecture
doc, il `doc-author` riceve spec+diff+registro: stessi input per chiunque, quindi comportamento più
uniforme tra sviluppatori. È lo stesso principio dell'isolamento del test-author, generalizzato.

**Proposta.**
1. Mappa fase → agente → tier di modello (default del kit, questi da validare):

   | Fase | Agente | Modello (default) | Razionale |
   |---|---|---|---|
   | F0 Intake | `intake` | economico (haiku) | parsing e normalizzazione: meccanico |
   | F1 Specifica | `spec-author` | top (opus) | la fase a più leverage dell'intero flusso |
   | F2 Piano + implementazione | orchestratore/main | top | decide e scrive codice, dialoga ai gate |
   | F2 Test | `test-author` (esiste) | top | derivare test dal contratto è cognitivo |
   | F3 Qualità | `test-runner` | economico (haiku) | classifica diff, lancia comandi, legge esiti |
   | F4 Documentazione | `doc-author` (GAP-07) | intermedio (sonnet) | scrittura fedele, non ragionamento profondo |
   | F5 Consegna | nessun agente | — | meccanica pura: hook/script (GAP-01/02) |

2. I tier di default vivono nel frontmatter degli agenti del kit; un override per-progetto
   (`flow.config.agents.<fase>.model`) è desiderabile per la politica costi ma **da verificare in
   implementazione** (il frontmatter è statico nel plugin; l'override richiede che l'orchestratore
   possa passare il modello allo spawn — capacità da provare su Claude Code corrente).
3. Usare **alias di tier**, mai ID di modello puntuali, nei default: gli ID invecchiano, i tier no.

**Vincoli onesti.**
- I **gate umani restano nell'orchestratore**: un sub-agent lavora in autonomia e riconsegna; non
  dialoga con l'utente. Quindi gli agenti *preparano* (bozza di spec, bozza di doc), l'orchestratore
  *presenta* al gate e registra l'esito nello stato. Nessun gate viene delegato.
- Gli hook (preEditGuard, preWorkSnapshot) scattano anche sui tool dei sub-agent: le garanzie non
  si indeboliscono — il meccanismo marcatore del test-author già si regge su questo.
- Ogni agente in più è superficie di kit da mantenere: si introduce dove il payoff è chiaro
  (`doc-author` subito, `intake` e `test-runner` a seguire), non "uno per fase" per principio.
- Costo/latenza: lo spawn ha un overhead (l'agente rilegge i suoi input), ripagato dal contesto
  piccolo e dal modello più economico dove possibile.

**Impatto.** Requisito nuovo che tocca l'architettura di orchestrazione. Severità: **Alto**
(abilitante per qualità e costi; dipende da GAP-01 per il passaggio dei contratti via stato e da
GAP-10 per l'orchestratore).

---

## 5. Punti parcheggiati (decisioni rimandate, non gap da risolvere ora)

**Spec Store esterno / integrazione con la skill del collega.** La modalità
`specStore.mode = "external"` era nata per integrarsi con la skill di un collega che popola un repo
dedicato con spec e assessment — dove però "specifica" significa una cosa diversa: specifiche
funzionali **calate nel contesto implementativo**, un ponte tra spec funzionale pura e
implementazione pura. L'integrazione va ripensata insieme, non risolta di lato. Nel frattempo la
proposta conservativa è: **congelare `same-repo` come unica modalità supportata** (documentandolo),
perché `external` oggi non ha né specifica operativa né implementazione (come si committa
sull'altro repo? con quali permessi? chi risolve i riferimenti incrociati?) — offrirla a metà è
peggio che non offrirla.

---

## 6. Riepilogo e ordine di attacco proposto

| # | Gap | Severità | Dipende da |
|---|-----|----------|-----------|
| GAP-01 | Operazioni di fase non garantite → stato per-task + hook guardiani | Critico | — |
| GAP-02 | Connettori senza scrittura (update ticket impossibile) | Critico | — |
| GAP-03 | Perimetro "solo componenti del kit" non enforced | Alto | — |
| GAP-04 | preEditGuard aggirabile via Bash | Alto | — |
| GAP-05 | Gate effimeri in /tmp, verifica che non si ri-arma, skip non auditabili | Alto | GAP-01 |
| GAP-06 | Branching assente (branch dopo Gate 2, prima del test-author) | Alto | GAP-01 |
| GAP-07 | F4 senza vera doc + ristrutturazione F4 doc / F5 PR+ticket, doc-playbook | Alto | GAP-01, 02, 06 |
| GAP-08 | Fast-path valutato in F0 senza codebase | Medio | — |
| GAP-09 | versionDrift invisibile (systemMessage) | Medio | — |
| GAP-10 | Entrypoint unico `flow` sopra skill modulari | Medio | GAP-01 |
| GAP-11 | Productive: script custom vs MCP (decisione da istruire) | Medio | GAP-02 |
| GAP-12 | Drawio/PROCESS/manuale da riallineare (6 fasi, meccanismi reali) | Medio | decisioni 01–08 |
| GAP-13 | Doctor non standalone | Basso | — |
| GAP-14 | Riferimento config nel manuale | Basso | **chiuso** |
| GAP-15 | Telemetria: `enabled=false` non spegne davvero (config ≠ `.envrc`) | Medio | — |
| GAP-16 | Agenti specializzati per fase con modello per fase (doc-author, intake, test-runner) | Alto | GAP-01, 10 |

**Esito (0.0.7, 2026-07-02)** — tutte e tre le ondate implementate in un unico rilascio, su
decisione di revisione:
- GAP-01/05 → `bin/flowState.mjs` (stato per-task + CLI) e riscrittura degli hook come guardiani
  (gate di fase, ri-arm su hash del diff, checklist di chiusura, skip auditabili).
- GAP-02 → connettori con `--update-status` e `--comment` (Productive e Zammad).
- GAP-03 → `perimeterGuard.mjs` (Skill | mcp__*) + `flow.config.perimeter` (enforce=true).
- GAP-04 → `preBashGuard.mjs` (scritture shell sui file di test bloccate).
- GAP-06 → branching nel flusso (dopo Gate 2, prima del test-author) + blocco sviluppo su branch base.
- GAP-07 → Fase 4 documentazione col registro `documentation.docs` + sub-agent `doc-author`;
  Fase 5 consegna (PR + ticket) garantita dalla checklist di chiusura.
- GAP-08 → fast-path: candidatura in F0, proposta vera in F1 (spec-author, post-retrieval/riproduzione).
- GAP-09 → `versionDrift` con `systemMessage` (visibile) + avviso di task in corso.
- GAP-10 → skill `flow` (entrypoint orchestratore).
- GAP-12 → PROCESS.md/manuale/drawio V5 riallineati a 6 fasi.
- GAP-13 → skill `doctor` standalone.
- GAP-15 → `bin/telemetry.mjs` (--apply/--remove/--status) + passo dedicato in flow-settings.
- GAP-16 → agenti `intake` (haiku), `spec-author` (opus), `test-runner` (haiku), `doc-author`
  (sonnet); `model: opus` sul test-author.

**Resta aperto**: GAP-11 (istruttoria MCP per Productive/Zammad — criteri definiti nel gap, da
istruire con un censimento dell'offerta reale) e i punti parcheggiati della sezione 5.
