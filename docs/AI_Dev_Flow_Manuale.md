# AI-Dev Flow - Manuale di progetto

> Documento di riferimento dello standard aziendale AI-Dev Flow, versione kit **0.0.8**.
> Lettore: lo sviluppatore che deve installare il kit su un progetto e lavorarci dentro.
> Questo manuale è discorsivo per scelta: spiega il perché delle cose, non solo il cosa.
> La fonte di verità normativa resta il repo (`PROCESS.md`, `INSTALL.md`, skill, hook, codice);
> se trovi una discrepanza tra questo manuale e il repo, vale il repo - e la discrepanza va segnalata.

---

## 1. Perché esiste questo progetto

Lo sviluppo assistito da AI, lasciato a sé stesso, produce risultati incostanti: ogni sviluppatore usa l'agente a modo suo, l'agente inferisce convenzioni che nessuno ha dichiarato, i test finiscono scritti dopo il codice (e quindi lo confermano invece di verificarlo), la documentazione invecchia in silenzio e nessuno sa più cosa è stato deciso e perché. AI-Dev Flow nasce per eliminare questa varianza: prende il processo di sviluppo AI-assistito e lo rende **uno standard unico, ripetibile e configurabile per progetto**, uguale per tutta l'azienda.

Il principio fondante è **human-in-the-loop**: l'AI esegue, la persona decide. La persona decide in tre punti precisi - la **specifica**, il **piano di implementazione**, la **revisione del diff** -
e tra un punto e l'altro l'AI lavora in autonomia. Nessuno di questi tre "gate" può essere saltato senza una scelta esplicita di chi lavora.

Dalla versione 0.0.7 c'è un secondo principio, altrettanto fondante: **standardizzato significa garantito, non prescritto**. Un processo scritto in un documento viene seguito *quasi* sempre; su cento task, "quasi sempre" significa flussi diversi tra sviluppatori diversi - l'esatto contrario
di uno standard. Per questo il kit distingue tre nature di lavoro e le tratta in modo diverso:

> ★ **La regola d'oro del kit:** ciò che è **meccanico** lo fa un hook o uno script (deterministico, scatta sempre); ciò che è **cognitivo** lo fa un agente dedicato; ciò che è una **decisione** la prende l'umano. E ogni deroga è esplicita, motivata e **registrata** - mai silenziosa.

Attorno a questi principi ruotano le idee che ritroverai in ogni fase:

**La Regola del 98%.** Prima di qualsiasi azione non banale l'AI deve essere sicura almeno al 98%
di aver capito *cosa* le viene chiesto e *perché*. Sotto quella soglia si ferma e fa domande
mirate. Non indovina, non tappa le ambiguità con assunzioni. Un'assunzione sbagliata su cui si
agisce costa molto più di una domanda fatta in tempo.

**Dichiarare, non inferire.** Il kit non deduce mai dal codice le cose che contano: la strategia di
test, le convenzioni di progetto e il registro della documentazione vengono **chiesti** in
un'intervista all'installazione e scritti nella configurazione. L'agente poi li *applica*.

**Anti teaching-to-the-test strutturale.** I test non li scrive chi scrive il codice: li scrive un
sub-agent isolato che riceve **solo la specifica**, prima che il codice esista, e li committa. Da
quel momento due hook li rendono read-only per l'implementatore - sia con gli strumenti di editing,
sia **via shell**. La garanzia è verificabile (git history) e fisica (gli hook bloccano).

**Knowledge-store versionato.** Specifiche approvate (Spec Store), changelog delle decisioni
(append-only, con i *perché*), documenti di architettura **per-contesto** (il sistema com'è *ora*,
mai la sua storia), test-playbook e registro della documentazione: i file `.md` versionati che
fanno da interfaccia tra una sessione e l'altra, e tra una persona e l'altra.

Tutto questo è confezionato come **plugin Claude Code**, con una separazione precisa: processo,
artefatti e regole sono **agnostici dallo strumento**; il plugin - skill, hook, agenti, connettori
- è lo **strato adattatore**, sottile e sostituibile.

---

## 2. Vincoli dello standard

Le regole che valgono sempre, in ogni progetto dove il kit è installato.

**Abilitazione per-progetto, mai globale.** Il kit si abilita nel `.claude/settings.json` del
singolo progetto. Skill, hook e agenti sono attivi solo lì. Ogni hook fa no-op se nel progetto
manca `flow.config.json`: il plugin è innocuo finché non è stato eseguito l'install.

**Solo componenti del kit - enforced.** Nei progetti con AI-Dev Flow si usano **esclusivamente**
plugin, skill, MCP, agenti e connettori installati dal kit. Nessuna skill personale, nessun plugin
di terze parti, nessun server MCP utente. La ragione: lo standard è ripetibile solo se il perimetro
degli strumenti è identico per chiunque apra il progetto. Dalla 0.0.7 questo non è più una regola
scritta ma un **enforcement tecnico**: l'hook di perimetro blocca ogni server MCP e ogni skill
fuori dal perimetro. Le eccezioni ammesse sono due: **Ponytail** (lo abilita il kit stesso) e le
**whitelist esplicite** di `flow.config.perimeter` - che sono una decisione umana, committata nel
repo, mai un'iniziativa dell'agente.

**I tre gate umani non si saltano.** Specifica, piano, revisione del diff. Ogni approvazione è
registrata nello stato del task; l'hook di guardia non lascia scrivere codice prima dei primi due.
L'unico alleggerimento è il fast-path (§4.8), e anche quello è una scelta esplicita registrata.

**Lo sviluppo avviene su un branch di lavoro.** Mai sul branch base: il flusso crea un branch
`<fix|feat>/<nome-breve-esplicativo>` dopo l'approvazione del piano, e l'hook blocca la scrittura
di sorgenti sul branch base. La consegna è una PR verso il branch di partenza.

**Le credenziali non si committano.** Vivono in `.ai-dev/connectors.env` (gitignorato); i
connettori lo caricano da soli. L'assessment dell'install non legge mai `.env` e segreti.

**La personalizzazione vive in un posto solo.** Tutto ciò che è specifico del progetto sta in
`flow.config.json` e si modifica con la skill `flow-settings`. L'aggiornamento del kit non lo tocca.

**Ogni operazione strutturale è transazionale e reversibile.** Install, uninstall e migrate:
o tutto o niente, idempotenti, con manifest per la disinstallazione precisa. L'uninstall preserva
i file che contengono lavoro tuo, salvo `--purge`.

---

## 3. L'anatomia del sistema

### 3.1 Lo stato per-task: la memoria del flusso

La novità che regge tutto il resto. Ogni task ha un file di stato -
`.ai-dev/tasks/<task-id>/state.json`, con un puntatore `ACTIVE` al task in corso - che registra i
**fatti**: fase corrente, gate approvati (con timestamp), branch di lavoro e base, decisione sullo
snapshot, verifiche eseguite (con l'hash del diff verificato), esito della doc-review, changelog,
aggiornamenti del ticket, PR, e **ogni deroga con la sua motivazione**. L'unico punto di accesso è
`bin/flowState.mjs` (libreria + CLI): nessuno parsa o scrive quel JSON per conto suo.

Va capito per ciò che è e per ciò che non è: è un **registro di fatti, non un workflow engine**.
Non esegue nulla - la logica vive negli hook e nelle skill. Punta agli artefatti (spec, branch,
changelog), non li contiene: nel caso peggiore si butta e si ricostruisce. È versionato
(`stateVersion`) e coperto dalle migrazioni del kit come ogni altro artefatto.

Tre effetti pratici che cambiano il lavoro quotidiano:

> ★ **Gli hook possono far rispettare i contratti di fase** - senza uno stato che dica "il Gate 1 è stato approvato", nessun guardiano può verificarlo. È lo stato che trasforma il processo da prescritto a garantito.
>
> ★ **Un task interrotto riprende da dov'era** - a inizio sessione l'hook ti dice "task in corso, fase X" e il lavoro riparte senza ricominciare da zero.
>
> ★ **Un collega può subentrare** - lo stato è committabile: tu porti il task alla spec approvata,
> chi apre il progetto dopo di te vede esattamente cosa è fatto e cosa manca.

Dalla 0.0.8 lo stato non è solo il registro: è anche la **fonte della transizione**. Il comando
`flowState.mjs next` - il **sequencer deterministico** - calcola il prossimo passo dai fatti
registrati (prima condizione non soddisfatta = prossimo passo, con l'azione da svolgere e il
comando di registrazione). E l'abbandono di un task è governato: `flowState.mjs abort --reason`
chiude lo stato (che resta come audit trail) ed elenca le **compensazioni** da proporre -
eliminare il branch di lavoro, annotare il ticket, ripulire lo snapshot.

**Perché il sequencer esiste (l'obiezione SAGA).** Un orchestratore centrale è il classico single
point of failure dei pattern di orchestrazione - e per un orchestratore *AI* il rischio non è
l'uptime ma il **giudizio**: può dimenticare un passo, convincersi che una fase sia fatta,
degradare col contesto lungo. L'architettura del kit risponde su tre livelli, ed è di fatto un
ibrido orchestrazione/choreography:
1. lo **stato è il saga log**: l'orchestratore è usa-e-getta - muore la sessione, se ne apre un'altra, si riparte dai fatti;
2. gli **hook sono choreography di enforcement**: guardiani indipendenti che reagiscono a eventi e non dipendono da ciò che l'orchestratore pensa - il suo fallimento produce "bloccato con l'istruzione di cosa manca", mai "flusso silenziosamente rotto";
3. il **sequencer toglie all'LLM anche la direzione**: "qual è il prossimo passo" è meccanico, quindi è codice (regola d'oro). L'orchestratore resta un single point of *dialogo* (qualcuno deve presentarti i gate), che è l'unica parte che *vogliamo* centrale.

### 3.2 Gli agenti per fase, ciascuno col suo modello

Il lavoro cognitivo di ogni fase è svolto da un **sub-agent dedicato** (`agents/` del plugin),
eseguito con il **modello adatto alla natura della fase**. Questo è uno dei punti di maggior valore
dello standard, per tre ragioni che vale la pena capire bene:

> ★ **Specializzazione**: ogni agente ha istruzioni scritte per una sola fase, e le fa bene.
>
> ★ **Economia**: normalizzare un ticket non richiede il modello migliore; derivare i test dal contratto sì. Il modello segue la natura del lavoro - qualità dove serve, risparmio dove basta.
>
> ★ **Standardizzazione**: un sub-agent non vede la conversazione - riceve **solo i suoi input dichiarati**. I contratti di fase diventano fisici: stessi input per chiunque, stesso comportamento. (È il principio dell'isolamento del test-author, generalizzato.)

| Fase | Agente | Modello | Perché questo modello |
|---|---|---|---|
| F0 Intake | `intake` | economico (haiku) | parsing e classificazione: meccanico |
| F1 Specifica | `spec-author` | top (opus) | la fase a più leverage dell'intero flusso |
| F2 Piano+codice | orchestratore | top | decide, implementa, dialoga ai gate |
| F2 Test | `test-author` | top (opus) | derivare i test dal contratto è cognitivo |
| F3 Qualità | `test-runner` | economico (haiku) | lancia comandi e riporta esiti |
| F4 Documentazione | `doc-author` | intermedio (sonnet) | scrittura fedele su input dichiarati |
| F5 Consegna | nessuno | - | meccanica pura: script e hook |

Un vincolo strutturale da conoscere: **i gate umani restano sempre nell'orchestratore**. Un
sub-agent lavora in autonomia e riconsegna; non dialoga con te. Gli agenti *preparano* (bozza di
spec, esiti dei test, aggiornamenti di doc), l'orchestratore *presenta* al gate e registra l'esito.

### 3.3 Skill, hook e connettori

Le **skill**: `flow` è l'**entrypoint** - «lavora su questo ticket» - e orchestra le sei fasi con
un loop deterministico: chiede al sequencer il prossimo passo (`flowState next`), lo esegue
(delegando ai sub-agent, presentando a te i gate), registra il fatto, ripete; `doctor` è la
verifica di salute invocabile in ogni momento; `install`,
`uninstall`, `migrate`, `flow-settings`, `connectors-check` sono le skill di servizio; le quattro
skill di processo (`intake-parser`, `spec-context`, `impl-runbook`, `test-selector`) definiscono
il *come* delle fasi e restano usabili anche da sole dove ha senso (es. `test-selector` dopo una
modifica fatta a mano).

Gli **hook** sono i guardiani deterministici - scattano sempre, non dipendono dalla buona volontà:

- `versionDrift` (SessionStart) - ti avvisa **con un messaggio visibile** se il kit del progetto è da migrare e se c'è un task in corso da riprendere.
- `preEditGuard` (PreToolUse) - due guardie: i file di test sono read-only per l'implementatore; e con un task attivo **non si scrive codice sorgente** senza spec approvata, piano approvato e branch di lavoro (né sul branch base). Deroghe solo esplicite e registrate.
- `preBashGuard` (PreToolUse su Bash) - chiude la porta laterale: niente `sed -i`, redirection, `tee`, `mv/cp/rm` sui file di test via shell.
- `perimeterGuard` (PreToolUse su Skill e MCP) - l'enforcement del perimetro: blocca skill e server
  MCP fuori dal kit e dalle whitelist.
- `preWorkSnapshot` (PreToolUse) - alla prima modifica di codice produttore di dati chiede (a te) se catturare lo snapshot "before"; la decisione finisce nello stato del task.
- `postWorkVerification` (Stop) - il **guardiano di fine turno**: non lascia chiudere un turno con modifiche in aree coperte dal test-playbook senza una verifica registrata per *esattamente* quel diff (se il codice cambia dopo la verifica, il gate **si ri-arma da solo**); e a implementazione conclusa non lascia chiudere senza doc-review, changelog e ticket aggiornato (o skip espliciti).

I **connettori** (Productive per il ticketing, Zammad per l'helpdesk - i default aziendali) sono
script bundlati con un contratto uniforme: in **lettura** restituiscono il JSON normalizzato del
ticket (con download degli allegati in `.ai-dev/attachments/`); in **scrittura** - novità 0.0.7 -
espongono `--update-status` e `--comment`, i comandi deterministici con cui il flusso aggiorna il
ticketing a fine Fase 1 e in Fase 5. Per cambiare o aggiungere un connettore (es. Jira) si rispetta
il contratto e si aggiorna `flow.config.connectors`: il flusso non cambia.

---

## 4. Il flusso, fase per fase

Sei fasi (0–5), tre gate umani, un ramo BUG e un fast-path governato. Ogni fase ha un
**contratto**: cosa richiede in input, cosa produce in output, chi vincola. I contratti non sono
più solo prosa: sono verificati dagli hook attraverso lo stato del task.

### 4.1 Fase 0 - Intake

**Cosa succede.** Arriva un ticket (CR o BUG). L'orchestratore verifica i connettori (contract-check: se quello che serve è ROTTO ci si ferma subito), avvia lo **stato del task** (`flowState start`), legge il ticket via connettore (e l'eventuale ticket di helpdesk collegato) e delega la normalizzazione al sub-agent **intake** (modello economico): tipo, priorità, riferimenti, cliente, allegati scaricati, e - per i BUG - se esiste una descrizione di riproduzione.

**La regola d'oro della fase**: non si legge la codebase. E il fast-path qui è solo una
**candidatura** dai segnali del ticket - senza aver visto il codice non si può sapere quanto codice
tocca la modifica (la proposta vera arriva in Fase 1).

| Contratto F0 | |
|---|---|
| **Richiede** | Riferimento a ticket; connettori configurati con credenziali; contract-check non ROTTO. |
| **Produce** | Contesto richiesta normalizzato + stato del task avviato (fase `intake`). |
| **Vincola** | La F1 non parte senza contesto richiesta; connettore rotto = flusso fermo qui. |
| **Non può** | Leggere la codebase; proporre (non solo candidare) il fast-path; decidere alcunché. |

### 4.2 Fase 1 - Definizione della specifica

**Cosa succede.** Il sub-agent **spec-author** (modello top) riceve un contratto d'ingresso esplicito - contesto richiesta, percorsi degli architecture doc, constraint, changelog - e lavora con la disciplina di `spec-context`: **prima il documento di architettura, poi il codice**, mirato (pochi file giusti). Se il documento è in drift rispetto al codice, lo segnala subito - un doc stantio è peggio di nessun doc. Produce: la bozza di specifica, l'**impact analysis** sul changelog (la richiesta rompe scelte deliberate del passato?), le **domande sui buchi** (solo dove la spec è davvero incompleta) e - ora che ha visto il codice - l'eventuale **proposta di fast-path** motivata.

L'orchestratore fa a te le domande sui buchi (registro Q&A), itera con lo spec-author se serve, e arriva al **► GATE UMANO 1: approvi la SPECIFICA?** Il loop di raffinamento ha soglie dichiarate (`maxRefine`: avviso a 3 giri, blocco a 6). Per i BUG, prima della spec c'è la **riproduzione** (caso minimo, changelog per individuare l'origine).

Ad approvazione - e qui la 0.0.7 cambia le cose - la chiusura della fase è **garantita**: la spec va nello Spec Store (`record-spec`), il gate è registrato (`approve-gate spec`) e il task nel ticketing riceve il riferimento via `--comment` (registrato con `record-ticket-update`). Se manca qualcosa, il guardiano di fine turno lo pretende.

| Contratto F1 | |
|---|---|
| **Richiede** | Contesto richiesta (F0); architecture doc dei contesti coinvolti; changelog; constraint. |
| **Produce** | SPEC approvata al Gate 1 e salvata; Q&A; impact analysis; ticket commentato col riferimento; tutto registrato nello stato. |
| **Vincola** | La F2 non parte senza Gate 1 registrato (hook). La spec è l'**unico** input del test-author: la sua qualità determina la qualità dei test. |
| **Convenzioni** | Architecture doc prima del codice; drift segnalato subito; domande solo sui buchi; fast-path proposto qui, mai in F0. |

### 4.3 Fase 2 - Implementazione

**Cosa succede.** L'orchestratore propone il **piano** (approccio, file toccati, rischi).
**► GATE UMANO 2: approvi il PIANO?** (`approve-gate plan`).

Poi, **prima che qualsiasi commit esista**, il **branch di lavoro**: ti viene chiesto da quale branch staccare (default: quello di default del repo) e proposto un nome **`<fix|feat>/<nome-breve-esplicativo>`** - `fix/` per i BUG, `feat/` per le CR, es. `feat/export-csv-ordini` - con possibilità di nome custom. Il branch è registrato nello stato (`set-branch`), e da lì in poi l'hook blocca lo sviluppo sul branch base. L'ordine non è casuale: il branch nasce prima del test-author *perché il test-author committa*, e quei commit devono già stare sul branch giusto.

Il lavoro si biforca sui due binari strutturalmente separati:

*Binario test.* Il sub-agent **test-author** riceve **solo la specifica**, posa il marcatore che lo autorizza, deriva i test dal contratto descritto nella spec, li **committa** (il timestamp git prova che esistono prima del codice) e rimuove il marcatore. Da quel momento i test sono blindati su entrambi i canali: editing (`preEditGuard`) e shell (`preBashGuard`).

*Binario codice.* L'implementatore lavora con contesto minimo (spec + piano + architecture doc), applica le **convenzioni dichiarate** (mai inferite), non può toccare i test (se ne ritiene uno sbagliato, lo segnala a te). Sulle modifiche a codice produttore di dati (`dataProducingPaths`) scatta il gate dello **snapshot "before"**: il confronto pre/post è possibile solo se lo stato "before" è catturato a codice pristino - la scelta (cattura o skip motivato) è tua e resta registrata nello stato, valida per tutto il task anche su più sessioni.

Chiude la fase il **► GATE UMANO 3: occhiata al diff** (`approve-gate diff`).

| Contratto F2 | |
|---|---|
| **Richiede** | Gate 1 registrato. Per il codice: Gate 2 + branch registrati (hook). Per i test: **solo la spec**. |
| **Produce** | Test committati prima del codice; implementazione con diff rivisto al Gate 3; branch di lavoro; decisione snapshot registrata. |
| **Vincola** | Senza Gate 1+2+branch l'hook **blocca fisicamente** la scrittura di sorgenti. I test sono immutabili per l'implementatore. Senza snapshot "before", niente non-regression sui dati in F3. |
| **Convenzioni** | Branch `<fix|feat>/<slug>`; convenzioni applicate, mai inferite; contesto minimo; deroghe solo via `record-override` con motivo. |

### 4.4 Fase 3 - Qualità

**Cosa succede.** Si lancia ciò che il cambiamento richiede, e a dirlo è il **test-playbook dichiarato** - mai l'intuito. La skill `test-selector` classifica il diff (dati/ETL? frontend? API/logica? trasversale?) e seleziona dal playbook (per ogni tipo: `pathPatterns`, `command`, `needsBeforeSnapshot`). Se il diff ricade in un'area senza regola, non si tira a indovinare: si avvisa e si propone di aggiungere la regola con `flow-settings`. Sui monorepo si interroga il tool nativo (Turborepo/Nx `--affected`); senza, fallback conservativo dichiarato.

L'**esecuzione** è del sub-agent **test-runner** (modello economico): lancia i comandi *esatti*, senza modificarli, e riporta fatti - pass/fail e l'estratto d'errore utile. Verdi → si registra `record-verification --status done` e si prosegue. Rossi → si torna in Fase 2; i test non si aggiustano.

La garanzia è del guardiano di fine turno: la verifica registrata vale per **l'hash esatto del diff verificato**. Se dopo i test tocchi ancora il codice, il gate si ri-arma da solo - non esiste più il "ho già verificato" generico.

| Contratto F3 | |
|---|---|
| **Richiede** | Diff dell'implementazione; test-playbook non vuoto; snapshot "before" per i test sui dati. |
| **Produce** | Selezione motivata + esiti; `record-verification` con hash del diff. |
| **Vincola** | Il turno non si chiude con modifiche coperte dal playbook e verifica assente/stantia (hook). La F4 non ha senso con test rossi. |
| **Convenzioni** | Selezione dal playbook, mai inferita; esecuzione fedele (i comandi non si "migliorano"); skip solo umano, motivato, registrato. |

### 4.5 Fase 4 - Documentazione

**Cosa succede.** La fase che prima era la più debole del flusso ora ha un agente e un guardiano. Il sub-agent **doc-author** (modello intermedio) riceve spec, diff finale, il **registro dei documenti** (`flow.config.documentation.docs`: per ogni documento, percorso e descrizione del suo *ambito*) e gli architecture doc dei contesti toccati. La sua valutazione d'impatto è deliberatamente **cognitiva, non meccanica**: la documentazione non rispecchia la struttura dei file, quindi niente mapping rigido path→documento - si confronta ciò che è cambiato con l'ambito dichiarato di ogni documento. Aggiorna gli impattati (architecture doc inclusi: sempre al presente, mai storia), scrive la **voce di changelog** (la scelta e il perché - è ciò che alimenta le impact analysis future), e se nessun documento è impattato lo dichiara con la motivazione: *"nessun impatto, perché…"* è un esito valido e registrabile; il silenzio no.

C'è anche qui un vantaggio sottile che vale la pena notare: il doc-author documenta ciò che il codice **è diventato** (legge il diff), non ciò che l'implementatore *racconta* di aver fatto - meno bias, tono uniforme tra task e sviluppatori diversi.

| Contratto F4 | |
|---|---|
| **Richiede** | Verifica F3 registrata; spec + diff; registro documentazione popolato (dall'intervista). |
| **Produce** | Doc aggiornate (o "nessun impatto, perché…"); voce di changelog; `record-doc-review` + `record-changelog`. |
| **Vincola** | Il guardiano di fine turno non lascia chiudere senza questi due fatti registrati (o skip esplicito). Le F1 future leggono ciò che scrivi qui. |

### 4.6 Fase 5 - Consegna

**Cosa succede.** La chiusura verso l'esterno, tutta meccanica: la **PR** dal branch di lavoro verso il branch base registrato nello stato (titolo dalla spec, corpo con link a spec e changelog, riferimento al ticket; `record-pr`), e l'**aggiornamento del ticket** via connettore - `--update-status "<ref>" "<stato>"` - con lo stato di arrivo (Review/Done) scelto da te e registrato. Poi `flowState close`: il task esce dallo stato attivo, il suo file di stato resta come audit trail.

| Contratto F5 | |
|---|---|
| **Richiede** | F4 registrata; branch e base nello stato; connettore funzionante. |
| **Produce** | PR aperta; ticket aggiornato; stato chiuso. |
| **Vincola** | Il guardiano pretende l'update del ticket (o skip esplicito) prima della chiusura. |

### 4.7 Il ramo BUG

Per i bug le Fasi 1–2 sono TDD da regressione: prima la **riproduzione** (caso minimo, changelog per trovare quale evolutiva l'ha introdotto - e solo dopo la riproduzione ha senso valutare il fast-path), poi il **test rosso** che cattura il bug (lo scrive il test-author, e viene committato come gli altri), poi la fix - provata dal test che diventa verde. Il red-test entra stabilmente nella suite di non-regression: quel bug non potrà tornare in silenzio.

### 4.8 Il fast-path

Due momenti distinti, per costruzione: in **Fase 0** solo la *candidatura* (segnali del ticket); in **Fase 1**, a retrieval fatto - e per i BUG a riproduzione fatta - la *proposta* vera, con i criteri finalmente verificabili: modifica circoscritta, niente schema dati, niente API pubbliche, soglia righe (`fastPath.thresholdLines`). Il sistema si ferma e ti spiega cosa salta (impact analysis, sub-agent test separato) e i rischi; la tua scelta è registrata (`record-override --gate fast-path`). Puoi sempre forzare il percorso completo.

---

## 5. La mappa dei contratti: chi vincola chi

- **F0 → F1**: senza contesto richiesta (e connettori sani) non si specifica nulla.
- **F1 → F2**: senza Gate 1 registrato non si pianifica; la spec è l'unico input del test-author -
  il contratto più rigido del flusso.
- **Dentro F2**: senza Gate 2 + branch registrati l'hook blocca il codice; i test committati
  precedono il codice (ordine provato da git); la decisione snapshot precede il codice sui dati.
- **F2 → F3**: senza Gate 3 niente qualità; senza playbook niente selezione; la verifica vale per
  l'hash esatto del diff - cambi il codice, si ri-arma.
- **F3 → F4**: test verdi registrati, o non si chiude.
- **F4 → F5**: doc-review + changelog registrati, o non si chiude.
- **F5 → il futuro**: PR e ticket chiusi; lo stato del task resta come audit trail; changelog e
  architecture doc alimentano le F1 che verranno.

I tre gate umani sono i punti in cui la catena si ferma e attende te. La differenza rispetto a
prima della 0.0.7: la catena non è più affidata alla memoria dell'agente - è **verificata a ogni
anello** dagli hook, attraverso lo stato.

---

## 6. Il ciclo di vita del kit su un progetto

### 6.1 Installazione

Ordine sacro: **assessment (sola lettura) → report → intervista → installazione transazionale →
doctor**.

```
/plugin marketplace add menea-DQ/AI-Dev-Flow
/plugin install ai-dev-flow@ai-dev-flow --scope project
# poi, in Claude Code: invoca la skill `install`
```

L'**intervista** chiede (mai inferisce): il **test-playbook**, le **convenzioni di progetto**, il **registro della documentazione** (ogni documento con il suo ambito - nuovo in 0.0.7), il pattern di **branching**, dove vivono spec e changelog, gli architecture doc per-contesto, le soglie. Sui connettori non chiede quale tool (default aziendali: Productive e Zammad): segnala solo le credenziali da mettere in `.ai-dev/connectors.env`. Sul perimetro **informa**: `enforce=true` è parte dello standard.

Il **doctor** (Passo 5, e da 0.0.7 skill invocabile in ogni momento) verifica funzionalmente le guardie (prova a modificare un file di test via Edit E via Bash: entrambi devono bloccare), gli architecture doc, playbook e registro doc, i connettori (contract-check), la **coerenza della telemetria** e la sanità dello stato task.

### 6.2 Manutenzione

**Impostazioni**: skill `flow-settings` - test-playbook, convenzioni, registro documentazione,
branching, perimetro (whitelist esplicite), soglie. Un'eccezione importante: quando tocchi
`telemetry.*`, la skill riallinea anche i blocchi reali con `bin/telemetry.mjs --apply|--remove` -
perché `flow.config.telemetry` è solo l'intento, ciò che attiva l'OTEL sono `.envrc` e
`settings.json` (vedi Appendice A).

**Aggiornamento kit**: `/plugin marketplace update ai-dev-flow`, poi skill `migrate` per-progetto.
La migrazione `0.0.6 → 0.0.7` aggiunge da sola le nuove sezioni di config (documentation,
branching, perimeter) e segnala eventuali incoerenze di telemetria. L'hook di inizio sessione ti
avvisa - ora con un messaggio che vedi tu, non solo l'agente - se il progetto è rimasto indietro.

**Disinstallazione**: skill `uninstall` - manifest-driven, preserva il tuo lavoro (config,
architecture, changelog e gli stati dei task restano se modificati), `--purge` per rimuovere tutto.

### 6.3 Telemetria

Con `telemetry.enabled=true` il kit abilita l'OTEL nativo di Claude Code verso lo stack
OTLP+Grafana (`telemetry/docker-compose.yml`). Attivazione per-progetto via `.envrc` (direnv) +
`settings.json`; solo metriche e metadati (token, costi, sessioni; `project.name` e `user.email`
per l'attribuzione), mai contenuti. Per spegnerla davvero: `flow-settings` (che usa
`bin/telemetry.mjs --remove`), non il solo flag in config.

---

## 7. Il sistema all'atto pratico

### 7.1 Il comando che usi ogni giorno

> **Tu:** «Lavora su questo task: https://app.productive.io/12345-acme/tasks/task/67890»

L'agente invoca la skill **`flow`** e da lì è il processo a guidare - letteralmente: a ogni giro l'orchestratore chiede al sequencer «qual è il prossimo passo?» (`flowState next`) ed esegue ciò che risponde. In sequenza: contract-check, stato avviato, intake (sub-agent economico), spec-author che ti porta bozza + domande, **Gate 1**, salvataggio spec + commento sul ticket (garantiti), piano, **Gate 2**, richiesta del branch («da `main`? Propongo `feat/export-csv-ordini`»), test-author che committa i test, implementazione (con l'eventuale gate snapshot se tocchi dati), **Gate 3** sul diff, selezione test dal playbook + test-runner, doc-author che aggiorna documenti e changelog, PR proposta verso il branch base, ticket in Review. A ogni passo lo stato registra; a ogni mancanza il guardiano blocca.

Se ti interrompi a metà - riunione, fine giornata - alla sessione dopo l'hook ti accoglie con «Task in corso: productive-67890, fase quality» e si riparte da lì: il sequencer risponde la stessa cosa a qualunque sessione. Se il task lo prende un collega, per lui vale lo stesso. E se il task muore (cliente che ritira la richiesta): «abbandona il task» → `abort --reason`, che chiude lo stato e ti propone le compensazioni (branch da eliminare, ticket da annotare).

### 7.2 Un BUG

> **Tu:** «Bug: https://helpdesk.azienda.it/#ticket/zoom/4321»

Intake dal connettore Zammad, riproduzione del caso minimo (il changelog indica l'evolutiva sospetta), spec del fix col fast-path eventualmente proposto *dopo* la riproduzione, Gate 1, branch `fix/totale-ordine-sbagliato`, red-test committato, fix, test verde, doc-review («nessun documento impattato: il fix non cambia invarianti - registrato»), changelog, PR, ticket chiuso.

### 7.3 Quando il sistema ti ferma (ed è un bene)

- Provi a modificare un file di test - anche con un `sed` furbo: **bloccato**, due hook.
- L'agente prova a scrivere codice prima che tu abbia approvato il piano: **bloccato**, con
  l'elenco di cosa manca.
- Chiudi il turno con modifiche ETL non verificate: **bloccato** - o test, o il tuo skip motivato.
- L'agente prova a usare un MCP personale: **bloccato** - se serve davvero, lo whitelisti tu con
  `flow-settings`, e la scelta resta committata.
- Ritocchi il codice dopo i test: il gate di verifica **si ri-arma da solo**.

### 7.4 Manutenzione quotidiana

> «Doctor.» → report completo: guardie funzionanti (Edit e Bash), playbook ok, registro doc con 3
> documenti, connettori OK/AVVISO, telemetria coerente, nessun task orfano.
>
> «Aggiungi al registro doc: `docs/etl.md` copre le pipeline di sync.» → `flow-settings` aggiorna
> `documentation.docs`; da domani il doc-author lo valuta a ogni chiusura.
>
> «Il team vuole usare l'MCP di GitHub qui.» → decisione tua: `flow-settings` →
> `perimeter.allowedMcpServers += "github"`, committato, uguale per tutti.

---

## 8. Best practice

**Cura la spec più di ogni altra cosa.** È l'unico input del test-author e la base del piano.
Dieci minuti in più al Gate 1 valgono ore dopo.

**Non svuotare i gate.** Approvare senza leggere rende il processo un teatrino - e ora che le
approvazioni sono registrate, il teatrino lascia traccia.

**Tieni vivo il playbook e il registro doc.** Quando il selettore o il doc-author segnalano un'area
scoperta, quella è l'occasione per dichiararla, non per ignorare l'avviso.

**Cattura lo snapshot quando te lo chiede.** Il momento in cui il gate scatta è l'unico momento
possibile: dopo, il "before" non esiste più.

**Usa gli skip, non aggirarli.** Ogni guardiano ha la sua valvola: skip motivato, registrato, tuo.
È la differenza tra un'eccezione governata e un buco nello standard.

**Rispetta il perimetro (ora ci pensa lui).** Se uno strumento esterno ti sembra indispensabile,
la strada è la whitelist committata o la proposta di adozione nel kit - mai l'uso personale.

---

## 9. Limiti noti (dichiarati)

Onestà sui confini. Il **pre-bash-guard è un'euristica**: copre i vettori comuni di scrittura via shell, non ogni percorso possibile - la garanzia forte resta la coppia hook + git history. Il **perimetro** blocca skill e MCP a livello di tool; non può impedire ciò che accade fuori da Claude Code. L'**override per-progetto del modello degli agenti** non è ancora configurabile da `flow.config` (i tier vivono nel frontmatter degli agenti del kit). Le **scritture dei connettori** sono implementate secondo le API documentate di Productive/Zammad ma vanno validate sul campo con credenziali reali (il contract-check probe copre la lettura). Il **sequencer** dipende dai fatti registrati: un fatto vero ma non registrato produce un `next` "indietro" - la regola è registrare il fatto mancante, mai forzare. E l'**istruttoria MCP** per i connettori (GAP-11) resta una decisione aperta, con i criteri definiti nella gap analysis. Tutto il resto di ciò che era "prescritto ma affidato all'agente" nella 0.0.6 - salvataggio spec, aggiornamento ticket, esecuzione test, doc e changelog, vincolo di perimetro, e dalla 0.0.8 anche la **sequenza stessa del flusso** - è oggi **garantito da hook, stato e sequencer**.

---

## Appendice A - Riferimento della configurazione (`flow.config.json`)

`flow.config.json` è l'unico punto di personalizzazione per-progetto: lo crea l'install (dai
default del template + le risposte dell'intervista) e lo si modifica con la skill `flow-settings`.
Per ogni chiave: cosa fa, il default, e **chi la legge** - perché sapere chi consuma un parametro è
ciò che ti dice l'effetto pratico di cambiarlo.

### `specStore` - dove vivono le specifiche approvate

| Chiave | Default | Effetto |
|---|---|---|
| `mode` | `"same-repo"` | Le spec stanno nel repo del progetto. (`"external"` è **congelato**: non operativo, in attesa dell'integrazione col sistema spec/assessment aziendale - vedi gap analysis, punti parcheggiati.) |
| `path` | `".ai-dev/specs"` | Cartella dello Spec Store. |
| `repoUrl` | `null` | Riservato alla futura modalità external. |

*Letta da*: skill flow / spec-author in Fase 1 (salvataggio, `record-spec`).

### `changelog` - il log delle decisioni

| Chiave | Default | Effetto |
|---|---|---|
| `path` | `".ai-dev/changelog.md"` | Posizione del changelog append-only (cosa è stato fatto e perché). |

*Letta da*: spec-author (impact analysis, F1) e doc-author (scrittura voce, F4).

### `architectureDocs` - il registro dei documenti di architettura

| Chiave | Default | Effetto |
|---|---|---|
| `byContext.<contesto>.path` | - (intervista) | Per ogni contesto, il path del suo documento di architettura: ciò che si legge *prima* del codice. |

*Letta da*: spec-author (F1), impl-runbook (F2), doc-author (F4), doctor.

### `documentation` - il registro della documentazione di progetto *(nuovo in 0.0.7)*

| Chiave | Default | Effetto |
|---|---|---|
| `docs[]` | `[]` | Elenco `{ path, scope }`: ogni documento di progetto con la descrizione del suo **ambito** («docs/api.md - i contratti REST esposti»). È ciò che il doc-author valuta a ogni chiusura: il mapping è cognitivo sull'ambito, non meccanico sui path. Vuoto = la F4 valuta solo gli architecture doc (il doctor lo segnala). |

*Letta da*: doc-author (F4), doctor.

### `branching` - il branch di lavoro *(nuovo in 0.0.7)*

| Chiave | Default | Effetto |
|---|---|---|
| `namePattern` | `"<fix|feat>/<nome-breve-esplicativo>"` | La convenzione del nome branch proposto dopo il Gate 2 (fix=BUG, feat=CR). Il nome custom resta sempre possibile. |

*Letta da*: skill flow / impl-runbook (F2). Il branch effettivo di ogni task vive nello **stato**
(`set-branch`), incluso il branch base per la PR di Fase 5.

### `perimeter` - l'enforcement "solo componenti del kit" *(nuovo in 0.0.7)*

| Chiave | Default | Effetto |
|---|---|---|
| `enforce` | `true` | Attiva il perimeterGuard: skill e server MCP fuori dal kit sono bloccati. `false` disattiva (deroga di progetto, sconsigliata: il doctor la segnala). |
| `allowedMcpServers` | `[]` | Whitelist esplicita di server MCP ammessi (es. `["github"]`). Decisione umana, committata. |
| `allowedSkills` | `[]` | Whitelist esplicita di skill esterne ammesse. |

*Letta da*: hook perimeterGuard, doctor.

### `testPlaybook` - la ricetta dichiarata dei test

| Chiave (per voce) | Effetto |
|---|---|
| `appliesWhen` | Descrizione umana di quando il test si applica. |
| `pathPatterns` | Glob machine-readable: matching deterministico di hook e selettore. |
| `command` | Il comando esatto per lanciare il test (il test-runner non lo altera). |
| `needsBeforeSnapshot` | `true` per i test pre/post sui dati (gate `preWorkSnapshot`). |

*Letta da*: test-selector e test-runner (F3), postWorkVerification, preWorkSnapshot. Playbook
vuoto = Fase 3 cieca (il doctor avvisa).

### `projectConventions` - le convenzioni dichiarate

| Chiave | Default | Effetto |
|---|---|---|
| `rules[]` | `[]` | `{ context, rule }`: le convenzioni che l'implementatore applica senza inferirle. |
| `sourceDoc` | `null` | In alternativa: il documento del progetto che le descrive. |

*Letta da*: impl-runbook (F2).

### `maxRefine` - le soglie del loop di raffinamento

| Chiave | Default | Effetto |
|---|---|---|
| `warn` / `block` | `3` / `6` | Al terzo giro di raffinamento spec, avviso; al sesto, blocco. |

*Letta da*: skill flow (Gate 1, F1).

### `fastPath` - la scorciatoia per i task piccoli

| Chiave | Default | Effetto |
|---|---|---|
| `askEachTime` | `true` | Chiede conferma a ogni task eleggibile. |
| `autoUnderThreshold` | `false` | Se `true`, sotto soglia il fast-path scatta senza domanda. |
| `thresholdLines` | `20` | Soglia in righe toccate - applicata in **Fase 1**, a retrieval fatto (in F0 esiste solo la candidatura dai segnali del ticket). |

*Letta da*: spec-author / skill flow (F1).

### `testPaths` - cosa è "un file di test"

| Chiave | Default | Effetto |
|---|---|---|
| `testPaths` | `["**/*.test.*", "**/*.spec.*", "tests/**", "e2e/**"]` | Il perimetro dei file **read-only per l'implementatore** - su entrambi i canali: Edit (`preEditGuard`) e shell (`preBashGuard`). Un pattern mancante = un file di test non protetto. |

*Letta da*: preEditGuard, preBashGuard.

### `dataProducingPaths` - cosa arma il gate dello snapshot

| Chiave | Default | Effetto |
|---|---|---|
| `dataProducingPaths` | `[]` | Glob del codice che produce/trasforma dati persistenti. Prima modifica → gate `preWorkSnapshot`; la decisione va nello stato del task. Vuoto = gate mai armato. |

*Letta da*: preWorkSnapshot.

### `monorepo` - la selezione dei test sui monorepo

| Chiave | Default | Effetto |
|---|---|---|
| `tool` | `"auto"` | `auto` rileva Turborepo/Nx; `none` forza il fallback conservativo. |
| `affectedBase` | `"pre-task"` | La base per il calcolo `--affected`. |

*Letta da*: test-selector (F3).

### `tokenEconomy` - essenzialità del codice

| Chiave | Default | Effetto |
|---|---|---|
| `ponytail` | `"lite"` | Modalità del plugin esterno Ponytail (`off`\|`lite`\|`full`\|`ultra`); se ≠ `off` l'install lo abilita per-progetto. |
| `headroom` | `false` | Riservato alla futura compressione del contesto: oggi senza effetto. |

*Letta da*: install, impl-runbook (F2).

### `telemetry` - metriche di uso e costo

Attenzione al doppio livello: **ciò che attiva davvero la telemetria non è questo blocco**, ma le variabili OTEL in `.envrc` (direnv) e `.claude/settings.json`. Questo blocco è la **sorgente di intento** da cui quei file vengono generati.

| Chiave | Default | Effetto (via install o `bin/telemetry.mjs`) |
|---|---|---|
| `enabled` | `true` | Se `true`, i blocchi OTEL vengono scritti; se `false`, rimossi. |
| `otlpEndpoint` | `"http://localhost:4318"` | L'endpoint OTLP (cambiare backend = cambiare questo). |
| `otlpProtocol` | `"http/protobuf"` | Protocollo OTLP. |
| `serviceName` | `"ai-dev-flow"` | Il `service.name` OTEL. |
| `projectName` | `null` | Il `project.name` per l'attribuzione; `null` = nome cartella. |

*Letta da*: install/uninstall e **`bin/telemetry.mjs`** (`--apply` / `--remove` / `--status`), che dalla 0.0.7 riallinea i blocchi quando cambi questa sezione (lo fa flow-settings per te; il doctor verifica la coerenza). Serve `direnv` + `direnv allow`.

### `connectors` - ticketing e helpdesk

| Chiave | Default | Effetto |
|---|---|---|
| `ticketing` | `"productive"` | Connettore ticketing (= `connectors/<nome>.mjs` conforme al contratto, letture + scritture). |
| `helpdesk` | `"zammad"` | Connettore helpdesk. |
| `envFile` | `".ai-dev/connectors.env"` | File (gitignorato) da cui i connettori caricano le credenziali. |
| `instances` | `{}` | Riservato a configurazioni multi-istanza. |

*Letta da*: skill flow / intake-parser (F0), connectors-check, doctor, guardiano di chiusura (F5).

### Lo stato per-task (non è in `flow.config`)

Lo stato non si configura: vive in `.ai-dev/tasks/<id>/state.json` ed è gestito esclusivamente da `bin/flowState.mjs`. Comandi: `start` (avvia/riprende), **`next`** (il sequencer: il prossimo passo calcolato dai fatti), `show`, `approve-gate <spec|plan|diff>`, `set-branch`, `record-spec`, `record-tests-authored`, `record-snapshot`, `record-verification`, `record-doc-review`, `record-changelog`, `record-ticket-update`, `record-pr`, `record-override` (deroghe, sempre con motivo), `close` e **`abort --reason`** (abbandono governato, con compensazioni). È committabile (riprendibilità e handoff), versionato (`stateVersion`) e coperto dalle migrazioni.
