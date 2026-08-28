# AI-Dev Flow - Manuale di progetto

> Documento di riferimento dello standard aziendale AI-Dev Flow, versione kit **0.5.0**.
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
sub-agent isolato che riceve la specifica come **unica fonte di ciò che va asserito** (più la
*ricetta* dei test del progetto - playbook, convenzioni, dove vivono i test - che dice come si
scrivono qui, mai cosa asserire; il piano e il codice di implementazione non li vede MAI), prima
che il codice esista, e li committa. Da quel momento due hook li rendono read-only per
l'implementatore - sia con gli strumenti di editing, sia **via shell**. La garanzia è verificabile
(git history) e fisica (gli hook bloccano).

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
snapshot, manifest "prima" dove serve, verifiche eseguite (con l'hash del diff verificato), esito
della doc-review, changelog, aggiornamenti del ticket, PR, e **ogni deroga con la sua motivazione**. L'unico punto di accesso è
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

Dalla **0.5.0** il sequencer è anche lo **strumento di misura** del processo: la prima volta che
indica un passo lo annota nel log dello stato (`sequencer → <passo>`, con dedup sui richiami dello
stesso passo). I fatti registrati timestampano i *completamenti*; senza l'inizio-azione,
l'intervallo fra due gate non distingue il tempo macchina dall'attesa umana - ed è quella
distinzione che permette di capire *dove* un task è stato lento. Un ritorno a un passo già visto
(es. una verifica che si ri-arma) si registra di nuovo: anche i giri a vuoto diventano misurabili.
Il comando **`flowState.mjs report`** riassume le durate per passo dal log, annotando i passi che
contengono fermate umane: si guarda quello prima di ottimizzare alla cieca.

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
| F2 Piano | `plan-author` | top (opus) | traduce il COSA in COME: l'unica lettura profonda della codebase |
| F2 Test | `test-author` | intermedio (sonnet) | la derivazione è resa meccanica a monte (osservabili per clausola) |
| F2 Codice | orchestratore | intermedio (default di progetto) | esegue un piano già approvato, in loop coi test |
| F3 Qualità | `test-runner` | economico (haiku) | lancia comandi e riporta esiti |
| F4 Documentazione | `doc-author` | intermedio (sonnet) | scrittura fedele su input dichiarati |
| F5 Consegna | nessuno | - | meccanica pura: script e hook |

Un vincolo strutturale da conoscere: **i gate umani restano sempre nell'orchestratore**. Un
sub-agent lavora in autonomia e riconsegna; non dialoga con te. Gli agenti *preparano* (bozza di
spec, esiti dei test, aggiornamenti di doc), l'orchestratore *presenta* al gate e registra l'esito.

Un secondo vincolo, aggiunto nella **0.2.0** dopo averne pagato il prezzo su un task reale: **il
tier si dichiara nel frontmatter dell'agente e non si sovrascrive alla chiamata**. Il parametro
`model` dell'invocazione prende precedenza sul frontmatter, quindi passarlo - anche "per sicurezza" -
*disattiva* il tiering che questa tabella descrive. Nel task misurato, un `model: opus` passato per
prudenza ha fatto girare il doc-author (progettato per sonnet) su opus per oltre mezzo milione di
token, in una fase di scrittura fedele che non ne aveva bisogno. Se un tier è sbagliato, si corregge
il frontmatter dell'agente; la chiamata non è il posto giusto. Corollario: se **rifiuti una delega**,
quel lavoro lo fa l'orchestratore in linea, cioè sul modello del thread principale - una fase tarata
su un modello economico la paghi al tier più alto. L'orchestratore deve dichiararti quel costo prima
di procedere.

#### Il tier del thread principale (0.3.0)

Fino alla 0.2.0 questa tabella aveva un buco: il **thread principale** - che orchestra e *implementa* -
girava sul modello della tua sessione. Non era una scelta del processo, era un fatto incidentale: se
la sessione era su opus, l'implementazione era su opus. La 0.3.0 lo dichiara, partendo dal principio
che lo governa: **il modello top si paga dove si DECIDE, non dove si esegue.**

Le conseguenze sono tre. Primo: il **piano** di Fase 2 diventa un sub-agent dedicato (`plan-author`,
opus). Non è burocrazia da tassonomia - è l'unico modo di *garantire* che la pianificazione resti sul
modello top mentre la sessione gira su un tier intermedio, perché il frontmatter di un sub-agent
vince sempre sul modello di sessione. In più il lavoro caro gira in un contesto isolato e minimale,
invece di trascinarsi tutta la conversazione. Secondo: `test-author` scende a sonnet, perché dalla
0.2.0 il suo input non è più prosa da interpretare (parte normativa autosufficiente, un osservabile
dichiarato per clausola: il controllo di osservabilità esiste per rendere quella derivazione
meccanica). Terzo: il thread ha un **default di progetto** - `flow.config.models.mainThread`, scritto
dall'install in `.claude/settings.json`, tipicamente `sonnet`.

**Perché l'implementazione resta nel thread** e non diventa anche lei un sub-agent (la domanda giusta
da farsi, visto che un `impl-author` con `model: sonnet` renderebbe il tier *garantito* invece che
raccomandato): perché è un **loop** con la Fase 3, e isolarla trasformerebbe ogni test rosso in un
ripartire da freddo - ricaricare spec, piano, convenzioni e codice a ogni giro, cioè esattamente il
rimbalzo che la 0.2.0 ha eliminato altrove; perché le sue domande da Regola del 98% nascono *a metà*
del lavoro e bloccano le decisioni a valle, mentre quelle di una fase redazionale si enumerano prima
di produrre (il batching funziona solo sulle seconde); e perché è la fase più lunga, quella in cui
poterla osservare e correggere in corsa vale di più. Il paradosso che chiude il ragionamento: i task
dove l'isolamento funzionerebbe meglio (circoscritti, un file, loop corto) sono quelli dove si
risparmierebbe meno.

**L'escalation.** Se il lavoro si rivela più difficile del previsto, il tier alto si può recuperare -
ma è sempre una decisione tua, in due punti dichiarati. Al **GATE 2**, informata dalle *note di
complessità implementativa* del plan-author (che segnala cosa rende il lavoro difficile - file
accoppiati, invarianti non ovvi, schema dati, legacy senza test - ma **non decide**): è il momento in
cui la scala è più chiara, perché il piano elenca i file veri. Oppure **dopo i rossi**: al ripetersi
dei giri di test falliti è il *sequencer* a proporla (soglia `models.escalateAfterRedRounds`). La
seconda via è deliberatamente **reattiva invece che predittiva**: un test rosso è un fatto oggettivo,
mentre stimare la complessità *prima* è il tipo di giudizio su cui un LLM è meno affidabile. In
entrambi i casi la scelta si registra (`record-override --gate model-tier`): nessun cambio di tier
silenzioso, in nessuna delle due direzioni.

Un'ultima nota di onestà: il tier del thread è un **default**, non un vincolo. Puoi cambiarlo con
`/model` in qualunque momento e il kit non ha modo di accorgersene. Va bene così - il tier è
*economia*, non un presidio di correttezza. I presidi restano gli hook, i tre gate e i test scritti
prima del codice.

### 3.2-bis L'economia dell'attenzione (0.4.0)

Il kit misurava i token e ignorava una risorsa altrettanto scarsa: **la tua attenzione**. Il flusso
gira in gran parte in automatico, quindi la narrazione non la leggi - la salti - e nel frattempo
sommerge le due sole cose che devi leggere davvero: i **gate** e le **domande**. È un costo doppio:
si spendono i token piu' cari (quelli di output) per rendere illeggibile il momento della decisione.

La regola della 0.4.0 e' **poco mentre lavori, molto quando chiedi**, e si articola in tre cose.

**Mentre il flusso gira**: una riga per passo del sequencer - fase, esito, fatto registrato. Non si
riassume il lavoro di un sub-agent (l'ha già fatto), non si parafrasa l'istruzione di un hook, non si
commenta ciò che il diff mostra da sé. Un errore che blocca il flusso è l'unica eccezione: si dice
subito e per intero.

**Gli artefatti non si incollano in chat.** Questa parte non era stile, era struttura: fino alla
0.3.0 la bozza di spec esisteva *solo nella conversazione* (`record-spec` avviene dopo
l'approvazione), quindi il gate era obbligato a riversarla - e con specifiche da ~90 KB significa
decine di migliaia di token di output in un singolo messaggio, per un testo che nessuno legge a
schermo. Dalla 0.4.0 spec e piano nascono su file (`.ai-dev/tasks/<id>/spec-draft.md`,
`plan-draft.md`) e a schermo va il **percorso**, con un sommario di 5-15 righe.

**Le domande hanno un contratto.** Ogni domanda dice cosa si sta decidendo, perché la si chiede ora
(con la fonte: quale clausola, quale file, quale voce di changelog), cosa cambia in base alla
risposta, e 2-4 opzioni con la conseguenza di ciascuna. Con `AskUserQuestion` il contesto va **dentro
il campo `question`**, che è l'unico di cui sia garantita la visibilità; `header` ha un tetto di 12
caratteri e le `label` sono di 1-5 parole, quindi non è lì che si spiega.

> ★ **Il vincolo che risolve le "domande senza senso"**: le domande di un sub-agent si **riscrivono,
> non si inoltrano**. Un sub-agent le formula avendo in testa spec, codice e changelog; l'orchestratore
> non ha nulla di quello, e tu meno ancora. Inoltrare verbatim è la causa più comune di domande
> incomprensibili. Per questo i contratti di `spec-author` e `plan-author` ora impongono di
> consegnare, con ogni domanda, il suo contesto: chi ce l'ha deve passarlo, perché chi riscrive non
> può inventarlo.

Il veicolo tecnico è un **output style** (`output-styles/ai-dev-flow.md`) consegnato dal plugin come
skill e hook - non copiato nei progetti. L'install ne scrive solo la selezione in
`.claude/settings.json` (`flow.config.output.style`), quindi vale solo nei progetti col kit e resta
una tua scelta: `"inherit"` non tocca nulla. Nota verificata sul campo: uno stile di plugin si
seleziona col nome **namespaced** (`ai-dev-flow:AI-Dev Flow`); esiste anche un `force-for-plugin` che
lo imporrebbe senza settings, ma scavalca la scelta esplicita dell'utente ed è stato scartato di
proposito - in un kit dove ogni deroga è registrata, un'imposizione silenziosa sarebbe fuori posto.

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
- `postWorkVerification` (Stop) - il **guardiano di fine turno**: non lascia chiudere un turno con modifiche in aree coperte dal test-playbook senza una verifica registrata per lo stato *attuale* del codice coperto - dalla **0.5.0** l'hash è sul **contenuto dei file nei pathPatterns del playbook**, non sull'intero diff git: se quel codice cambia dopo la verifica il gate **si ri-arma da solo**, mentre doc, changelog e commit non lo ri-armano (l'hash globale forzava ri-verifiche spurie a ogni scrittura del flusso stesso). E a implementazione conclusa non lascia chiudere senza doc-review, changelog e ticket aggiornato (o skip espliciti).

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

**Cosa succede.** Il sub-agent **spec-author** (modello top) - che dalla **0.4.0** scrive la bozza su file (`.ai-dev/tasks/<id>/spec-draft.md`) invece di consegnarla in chat - riceve un contratto d'ingresso esplicito - contesto richiesta, percorsi degli architecture doc, constraint, changelog e, dalla **0.2.0**, gli **input di Fase 0** (`.ai-dev/tasks/<id>/inputs/`, più quelli dei task precedenti dello stesso ticket: brief degli stakeholder, discovery in sola lettura sul sistema sorgente, fixture grezze) - e lavora con la disciplina di `spec-context`: **prima il documento di architettura, poi il codice**, mirato (pochi file giusti). Se il documento è in drift rispetto al codice, lo segnala subito - un doc stantio è peggio di nessun doc. Produce: la bozza di specifica, l'**impact analysis** sul changelog (la richiesta rompe scelte deliberate del passato?), le **domande sui buchi** (solo dove la spec è davvero incompleta) e - ora che ha visto il codice - l'eventuale **proposta di fast-path** motivata.

Tre disciplineamenti introdotti dalla **0.2.0**, tutti nati da un consuntivo reale (vedi
`docs/proposta-riduzione-costi.md`), che spostano lavoro *a monte* del gate perché a valle costa un
ordine di grandezza in più:

> ★ **Le misure si prendono alla fonte.** Gli `inputs/` di Fase 0 sono la fonte *primaria*: una
> cifra che circola di seconda mano nei changelog e nelle spec si corrompe. Nel task misurato una
> copertura dati reale del 6% viaggiava come 21% in quattro documenti, e lo spec-author aveva
> dichiarato la misura "non verificabile" mentre era documentata negli input - costando un giro
> completo della fase. Nessuna misura si dichiara non verificabile senza aver aperto gli input.
>
> ★ **La spec si scrive in due parti.** Una **parte normativa** (perimetro, modello dati,
> comportamento atteso con i suoi osservabili, criteri di accettazione, decisioni di gate, file
> previsti) che deve bastare *da sola* al test-author, e una **parte di motivazione** (impact
> analysis, alternative scartate, rischi). Le fasi a valle leggono la prima; la seconda si scrive
> sempre - è la memoria del ragionamento - ma non si rilegge per intero.
>
> ★ **Controllo di osservabilità prima del gate.** Ogni clausola del comportamento atteso dichiara
> *come si osserva*: quale tipo di test la coprirebbe, e su cosa asserisce. Una clausola senza
> osservabile non è una clausola: è una domanda di gate, e va spostata fra le domande. Nello stesso
> passaggio si verifica la coerenza interna fra le decisioni prese al gate e le sezioni redatte
> prima di esse (una decisione al gate può aver reso incompleta una tabella scritta mezz'ora prima).
> Il motivo è strutturale: per il test-author di Fase 2 la spec è l'**unica fonte** del comportamento da testare (lavora alla cieca rispetto a codice e piano). Ciò che
> non è osservabile per lo spec-author non lo è nemmeno per lui, e diventa un emendamento
> post-gate - cioè un secondo passaggio completo della fase più cara del flusso.

L'orchestratore fa a te le domande sui buchi (registro Q&A) - riscritte col loro contesto, non inoltrate come le ha formulate il sub-agent - itera con lo spec-author se serve, e arriva al **► GATE UMANO 1: approvi la SPECIFICA?** Al gate vedi un sommario di 5-15 righe e il **percorso** della bozza, non la spec incollata. Dalla **0.5.0**, quando le domande sono poche, intervista e gate arrivano in **un'unica fermata** (una AskUserQuestion: le domande + l'approvazione); se una risposta può ribaltare la bozza, prima l'intervista. Il loop di raffinamento ha soglie dichiarate (`maxRefine`: avviso a 3 giri, blocco a 6). Per i BUG, prima della spec c'è la **riproduzione** (caso minimo, changelog per individuare l'origine).

Ad approvazione - e qui la 0.0.7 cambia le cose - la chiusura della fase è **garantita**: la spec va nello Spec Store (`record-spec`), il gate è registrato (`approve-gate spec`) e il task nel ticketing riceve il riferimento via `--comment` (registrato con `record-ticket-update`). Se manca qualcosa, il guardiano di fine turno lo pretende.

| Contratto F1 | |
|---|---|
| **Richiede** | Contesto richiesta (F0); architecture doc dei contesti coinvolti; changelog (le sole teste «Vincolante»); constraint; gli `inputs/` di Fase 0 come fonte primaria delle misure. |
| **Produce** | SPEC approvata al Gate 1 e salvata; Q&A; impact analysis; ticket commentato col riferimento; tutto registrato nello stato. |
| **Vincola** | La F2 non parte senza Gate 1 registrato (hook). La spec è l'**unico** input del test-author: la sua qualità determina la qualità dei test. |
| **Convenzioni** | Architecture doc prima del codice; drift segnalato subito; domande solo sui buchi; fast-path proposto qui, mai in F0; spec in due parti; ogni clausola col suo osservabile. |

### 4.3 Fase 2 - Implementazione

**Cosa succede.** Dalla **0.3.0** il **piano** lo redige un sub-agent dedicato, **`plan-author`**
(modello top) - e dalla **0.4.0** lo scrive su file (`.ai-dev/tasks/<id>/plan-draft.md`), presentandoti al gate il sommario e il percorso - che riceve la spec approvata, l'**elenco dei file letti** dallo spec-author in Fase 1 (dalla **0.5.0**: punto di partenza del suo retrieval, non il suo perimetro - la scoperta della codebase si paga una volta, non due), il registro Q&A, gli architecture doc dei contesti
toccati, le convenzioni di progetto e il test-playbook. Legge la codebase più a fondo di quanto
faccia la Fase 1 - qui servono i punti di innesto *reali*, non plausibili - e produce approccio, file
toccati con percorsi veri, **ordine degli interventi**, rischi, test previsti *scelti dal playbook*
(non inventati: il contenuto dei test lo deriverà il test-author dalla sola spec), più due cose che
prima non esistevano: un **controllo di copertura** (ogni clausola della spec ha un intervento che la
realizza; ogni intervento ha una clausola che lo richiede - il resto è fuori perimetro) e le **note
di complessità implementativa**, che ti servono al gate per decidere con quale tier implementare.

Il piano **non raggiunge mai il test-author**: la spec dichiara il COSA e resta la sua unica fonte del comportamento da testare (la ricetta dei test dice solo come si scrivono qui).
È questa separazione a rendere strutturale l'anti teaching-to-the-test - se il COME colasse nella
spec, i test validerebbero l'approccio scelto invece del comportamento atteso. Ed è la ragione per
cui piano e specifica sono due agenti e non uno.

**► GATE UMANO 2: approvi il PIANO?** (`approve-gate plan`) - e nella **stessa fermata**, con le note di complessità sotto gli occhi, **con quale tier implementiamo?** e **su quale branch?** Dalla **0.5.0** il gate è un'unica AskUserQuestion (piano, tier, branch base, nome): ogni stop in più è un context switch per chi risponde, e il tempo dei task lo mangiano le attese moltiplicate per gli stop.

Il **branch di lavoro** nasce quindi **prima che qualsiasi commit esista**: base scelta da te (default: quello di default del repo) e nome proposto **`<fix|feat>/<nome-breve-esplicativo>`** - `fix/` per i BUG, `feat/` per le CR, es. `feat/export-csv-ordini` - con possibilità di nome custom. Il branch è registrato nello stato (`set-branch`), e da lì in poi l'hook blocca lo sviluppo sul branch base. L'ordine non è casuale: il branch nasce prima del test-author *perché il test-author committa*, e quei commit devono già stare sul branch giusto.

Il lavoro si biforca sui due binari strutturalmente separati:

*Binario test.* Il sub-agent **test-author** riceve la specifica - **unica fonte di ciò che va asserito** - più, dalla **0.5.0**, la *ricetta* dei test del progetto (test-playbook, convenzioni, `testPaths`, test esistenti in lettura: come si scrivono i test *qui*, senza riscoprire il framework a ogni task - misurato: ~54 minuti a task di sola riscoperta); MAI il piano né il codice di implementazione. Posa il marcatore che lo autorizza, deriva i test dal contratto descritto nella spec, li **committa** (il timestamp git prova che esistono prima del codice) e rimuove il marcatore. Da quel momento i test sono blindati su entrambi i canali: editing (`preEditGuard`) e shell (`preBashGuard`).

*Binario codice.* L'implementatore lavora con contesto minimo (spec + piano + architecture doc), applica le **convenzioni dichiarate** (mai inferite), non può toccare i test (se ne ritiene uno sbagliato, lo segnala a te). Sulle modifiche a codice produttore di dati (`dataProducingPaths`) scatta il gate dello **snapshot "before"**: il confronto pre/post è possibile solo se lo stato "before" è catturato a codice pristino - la scelta (cattura o skip motivato) è tua e resta registrata nello stato, valida per tutto il task anche su più sessioni.

*Progetti senza git.* Dove non c'è un repository (deroga `branch` registrata) il Gate 3 non ha un
diff da guardare, e ricostruire *a posteriori* l'elenco dei file toccati con una ricerca per
timestamp è un invito a sbagliare il taglio: nel task misurato ci sono voluti tre tentativi, e due
hanno pescato file del task precedente. Dalla **0.2.0** l'inventario si costruisce per **confronto**:
all'inizio della fase, da codice ancora intatto, `flowState.mjs record-manifest` scrive
`.ai-dev/tasks/<id>/manifest-before.txt` (impronta di ogni file sotto le radici dichiarate in
`branching.manifestPaths`) e registra il fatto; al gate, `flowState.mjs diff-manifest` produce
nuovi / modificati / rimossi. È il **sequencer** a pretenderlo: senza manifest, il Gate 3 non arriva.
Come per lo snapshot sui dati, la finestra per catturarlo è mentre il codice è intatto - persa, non
torna.

Chiude la fase il **► GATE UMANO 3: occhiata al diff** (o all'inventario per confronto, senza git)
(`approve-gate diff`).

| Contratto F2 | |
|---|---|
| **Richiede** | Gate 1 registrato. Per il piano: spec approvata + architecture doc + convenzioni + test-playbook. Per il codice: Gate 2 + branch registrati (hook). Per i test: la spec (**unica fonte del COSA**) + la ricetta dei test (playbook, convenzioni, testPaths) - mai piano né codice. |
| **Produce** | Piano con copertura verificata e note di complessità; test committati prima del codice; implementazione con diff rivisto al Gate 3; branch di lavoro; decisione snapshot registrata; eventuale escalation di tier registrata. |
| **Vincola** | Senza Gate 1+2+branch l'hook **blocca fisicamente** la scrittura di sorgenti. I test sono immutabili per l'implementatore. Senza snapshot "before", niente non-regression sui dati in F3. |
| **Convenzioni** | Branch `<fix|feat>/<slug>`; convenzioni applicate, mai inferite; contesto minimo; deroghe solo via `record-override` con motivo. |

### 4.4 Fase 3 - Qualità

**Cosa succede.** Si lancia ciò che il cambiamento richiede, e a dirlo è il **test-playbook dichiarato** - mai l'intuito. La skill `test-selector` classifica il diff (dati/ETL? frontend? API/logica? trasversale?) e seleziona dal playbook (per ogni tipo: `pathPatterns`, `command`, `needsBeforeSnapshot`). Se il diff ricade in un'area senza regola, non si tira a indovinare: si avvisa e si propone di aggiungere la regola con `flow-settings`. Sui monorepo si interroga il tool nativo (Turborepo/Nx `--affected`); senza, fallback conservativo dichiarato.

L'**esecuzione** è del sub-agent **test-runner** (modello economico): lancia i comandi *esatti*, senza modificarli, e riporta fatti - pass/fail e l'estratto d'errore utile. Verdi → si registra `record-verification --status done` e si prosegue. Rossi → si registrano (`--status failed`) e si torna in Fase 2; i test non si aggiustano. Dalla **0.3.0** registrare il rosso non è una formalità: è ciò che rende il rientro in implementazione visibile al sequencer invece di essere un vuoto nello stato, e ciò che gli fa **contare i giri** - superata la soglia `models.escalateAfterRedRounds`, è lui a proporti l'escalation di tier.

La garanzia è del guardiano di fine turno: la verifica registrata vale per lo **stato attuale del codice coperto dal playbook** - dalla **0.5.0** l'hash si calcola sul *contenuto* dei file nei `pathPatterns` del test-playbook, non sull'intero diff git. Se dopo i test tocchi ancora quel codice, il gate si ri-arma da solo - non esiste più il "ho già verificato" generico; doc, changelog, salvataggi nello Spec Store e commit invece **non** lo ri-armano (con l'hash globale erano proprio le scritture del flusso stesso a forzare ri-verifiche spurie: misurato, 7 task su 13). E dalla **0.3.0** una verifica **rossa** non lo soddisfa: registrare il rosso è obbligatorio, ma non è un permesso di chiudere - il gate resta armato finché i test non passano (o non salti, motivando).

| Contratto F3 | |
|---|---|
| **Richiede** | Diff dell'implementazione; test-playbook non vuoto; snapshot "before" per i test sui dati. |
| **Produce** | Selezione motivata + esiti; `record-verification` con hash del diff. |
| **Vincola** | Il turno non si chiude con modifiche coperte dal playbook e verifica assente/stantia (hook). La F4 non ha senso con test rossi. |
| **Convenzioni** | Selezione dal playbook, mai inferita; esecuzione fedele (i comandi non si "migliorano"); skip solo umano, motivato, registrato. |

### 4.5 Fase 4 - Documentazione

**Cosa succede.** La fase che prima era la più debole del flusso ora ha un agente e un guardiano. Il sub-agent **doc-author** (modello intermedio) riceve spec, diff finale, il **registro dei documenti** (`flow.config.documentation.docs`: per ogni documento, percorso e descrizione del suo *ambito*) e gli architecture doc dei contesti toccati. La sua valutazione d'impatto è deliberatamente **cognitiva, non meccanica**: la documentazione non rispecchia la struttura dei file, quindi niente mapping rigido path→documento - si confronta ciò che è cambiato con l'ambito dichiarato di ogni documento. Aggiorna gli impattati (architecture doc inclusi: sempre al presente, mai storia), scrive la **voce di changelog** e, se nessun documento è impattato, lo dichiara con la motivazione: *"nessun impatto, perché…"* è un esito valido e registrabile; il silenzio no.

C'è anche qui un vantaggio sottile che vale la pena notare: il doc-author documenta ciò che il codice **è diventato** (legge il diff), non ciò che l'implementatore *racconta* di aver fatto - meno bias, tono uniforme tra task e sviluppatori diversi.

**La voce di changelog, dalla 0.2.0, ha due parti** - ed è la modifica che taglia il costo che
altrimenti *cresce da solo* a ogni incremento. In testa una sezione **«Vincolante»** con un tetto
duro di **15 righe**: solo ciò che i task futuri non possono ignorare (invarianti e contratti nuovi,
aree congelate e con quale presidio, debiti aperti/chiusi/peggiorati, superfici nuove, misure con il
**percorso della fonte primaria**). Nessun argomento, nessuna alternativa, nessun racconto. Sotto una
barriera di lettura, la **narrativa**: cosa, perché, alternative scartate, impatti - scritta sempre e
per intero, perché è la memoria del progetto. La divisione serve a un fatto misurato: con
l'istruzione "registra cosa e perché", le voci erano diventate saggi di 80-100 righe e il changelog
un file di 117 KB che **ogni** impact analysis futura rileggeva per intero. Ora la Fase 1 legge le
sole teste, e scende nella narrativa solo per tracciare una decisione nominata. Il tetto non è
burocrazia: la testa è l'unica parte che ogni task futuro rilegge, quindi se cresce, cresce il costo
di tutti i task successivi.

| Contratto F4 | |
|---|---|
| **Richiede** | Verifica F3 registrata; spec + diff; registro documentazione popolato (dall'intervista). |
| **Produce** | Doc aggiornate (o "nessun impatto, perché…"); voce di changelog (testa «Vincolante» ≤15 righe + narrativa); `record-doc-review` + `record-changelog`. |
| **Vincola** | Il guardiano di fine turno non lascia chiudere senza questi due fatti registrati (o skip esplicito). Le F1 future leggono ciò che scrivi qui. |

### 4.6 Fase 5 - Consegna

**Cosa succede.** La chiusura verso l'esterno, tutta meccanica: la **PR** dal branch di lavoro verso il branch base registrato nello stato (titolo dalla spec, corpo con link a spec e changelog, riferimento al ticket; `record-pr`), e l'**aggiornamento del ticket** via connettore - `--update-status "<ref>" "<stato>"` - con lo stato di arrivo (Review/Done) scelto da te e registrato. Poi `flowState close`: il task esce dallo stato attivo, il suo file di stato resta come audit trail.

Dalla **0.5.0** i passi di consegna sono **configurabili per-progetto** (`flow.config.delivery`: `specTicketComment`, `pr`, `ticketUpdate`): un progetto che non apre PR o non aggiorna il ticket lo dichiara **una volta** nella config committata, e il sequencer non chiede più quei passi. La stessa deroga ripetuta a ogni task è un difetto di configurazione, non una decisione - se ti accorgi che stai derogando sempre lo stesso passo, spegnilo con `flow-settings`.

Nei **progetti senza git** (deroga `branch` registrata) non c'è una PR da proporre: dalla **0.3.0** il
sequencer salta quel passo invece di inciampare, e la consegna resta il solo aggiornamento del ticket
- che continua a pretendere, usando il changelog come riferimento temporale al posto della PR.

| Contratto F5 | |
|---|---|
| **Richiede** | F4 registrata; branch e base nello stato (o la deroga `branch` per i progetti senza git); connettore funzionante. |
| **Produce** | PR aperta; ticket aggiornato; stato chiuso. |
| **Vincola** | Il guardiano pretende l'update del ticket (o skip esplicito) prima della chiusura. |

### 4.7 Il ramo BUG

Per i bug le Fasi 1–2 sono TDD da regressione: prima la **riproduzione** (caso minimo, changelog per trovare quale evolutiva l'ha introdotto - e solo dopo la riproduzione ha senso valutare il fast-path), poi il **test rosso** che cattura il bug (lo scrive il test-author, e viene committato come gli altri), poi la fix - provata dal test che diventa verde. Il red-test entra stabilmente nella suite di non-regression: quel bug non potrà tornare in silenzio.

### 4.8 Il fast-path

Due momenti distinti, per costruzione: in **Fase 0** solo la *candidatura* (segnali del ticket); in **Fase 1**, a retrieval fatto - e per i BUG a riproduzione fatta - la *proposta* vera, con i criteri finalmente verificabili: modifica circoscritta, niente schema dati, niente API pubbliche, soglia righe (`fastPath.thresholdLines`). Il sistema si ferma e ti spiega cosa salta e i rischi; la tua scelta è registrata (`record-override --gate fast-path`). Puoi sempre forzare il percorso completo.

Dalla **0.5.0** il fast-path taglia i **sub-agent redazionali, mai i gate**: niente plan-author (il piano compresso è nella spec approvata - file previsti, approccio - e lo presenta l'orchestratore al Gate 2, che resta), niente test-author separato (in Fase 3 girano comunque i test del playbook), doc-review in linea (registrazione obbligatoria: «nessun impatto, perché…» è un esito valido). Prima tagliava solo il test-author - misurato sul campo, non era un fast-path: il costo fisso di un task piccolo sta nei sub-agent redazionali (~2 ore di processo attorno a mezz'ora di lavoro). Se durante il piano compresso emerge che la modifica non è più circoscritta, si rientra nel percorso completo: è una scommessa revocabile, non un binario. I **tre gate umani restano in ogni caso**.

---

## 5. La mappa dei contratti: chi vincola chi

- **F0 → F1**: senza contesto richiesta (e connettori sani) non si specifica nulla.
- **F1 → F2**: senza Gate 1 registrato non si pianifica; la spec è l'unica fonte del COSA per il test-author -
  il contratto più rigido del flusso.
- **Dentro F2**: senza Gate 2 + branch registrati l'hook blocca il codice; i test committati
  precedono il codice (ordine provato da git); la decisione snapshot precede il codice sui dati.
- **F2 → F3**: senza Gate 3 niente qualità; senza playbook niente selezione; la verifica vale per
  il contenuto del codice coperto dal playbook - cambi quel codice, si ri-arma (doc e changelog no).
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

L'agente invoca la skill **`flow`** e da lì è il processo a guidare - letteralmente: a ogni giro l'orchestratore chiede al sequencer «qual è il prossimo passo?» (`flowState next`) ed esegue ciò che risponde. In sequenza: contract-check, stato avviato, intake (sub-agent economico), spec-author che ti porta bozza + domande, **Gate 1**, salvataggio spec + commento sul ticket (garantiti), plan-author che ti porta il piano con le note di complessità, **Gate 2** (dove decidi anche il tier), richiesta del branch («da `main`? Propongo `feat/export-csv-ordini`»), test-author che committa i test, implementazione (con l'eventuale gate snapshot se tocchi dati), **Gate 3** sul diff, selezione test dal playbook + test-runner, doc-author che aggiorna documenti e changelog, PR proposta verso il branch base, ticket in Review. A ogni passo lo stato registra; a ogni mancanza il guardiano blocca.

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

**Cura la spec più di ogni altra cosa.** È l'unica fonte di ciò che il test-author asserirà, e la base del piano.
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

Onestà sui confini. Il **pre-bash-guard è un'euristica**: copre i vettori comuni di scrittura via shell, non ogni percorso possibile - la garanzia forte resta la coppia hook + git history. Il **perimetro** blocca skill e MCP a livello di tool; non può impedire ciò che accade fuori da Claude Code. Il **tier dei modelli** è configurabile per-progetto solo per il *thread* (`flow.config.models`, dalla 0.3.0): quello dei **sub-agent** resta nel frontmatter degli agenti del kit - ed è deliberato, perché è ciò che lo rende garantito invece che raccomandato. Il rovescio della medaglia: il tier del thread è un **default**, non un vincolo - l'utente può cambiarlo con `/model` e il kit non ha modo di accorgersene (il tier è economia, non un presidio di correttezza). Le **scritture dei connettori** sono implementate secondo le API documentate di Productive/Zammad ma vanno validate sul campo con credenziali reali (il contract-check probe copre la lettura). Il **sequencer** dipende dai fatti registrati: un fatto vero ma non registrato produce un `next` "indietro" - la regola è registrare il fatto mancante, mai forzare. E l'**istruttoria MCP** per i connettori (GAP-11) resta una decisione aperta, con i criteri definiti nella gap analysis. Tutto il resto di ciò che era "prescritto ma affidato all'agente" nella 0.0.6 - salvataggio spec, aggiornamento ticket, esecuzione test, doc e changelog, vincolo di perimetro, e dalla 0.0.8 anche la **sequenza stessa del flusso** - è oggi **garantito da hook, stato e sequencer**.

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
| `path` | `".ai-dev/changelog.md"` | Posizione del changelog append-only. Ogni voce ha una testa «Vincolante» (≤15 righe: ciò che vincola i task futuri) e una narrativa sotto la barriera di lettura. |

*Letta da*: spec-author (impact analysis, F1 - legge le **sole teste**, scende nella narrativa solo
per tracciare una decisione nominata) e doc-author (scrittura voce, F4). Formato in
`templates/changelog.md`; la migrazione 0.1.0→0.2.0 allinea l'intestazione dei changelog esistenti
senza riscrivere le voci già presenti.

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
| `manifestPaths` | `["."]` *(0.2.0)* | Le radici da inventariare nel manifest "prima" dei progetti **senza git**: è la base del confronto che sostituisce il diff al Gate 3. |
| `manifestExclude` | `[".git/**", "node_modules/**", ".ai-dev/tasks/**", "dist/**", "build/**", "coverage/**", "**/.DS_Store", "**/*.log"]` *(0.2.0)* | Cosa non è "lavoro del task" e va escluso dall'inventario. |

*Letta da*: skill flow / impl-runbook (F2) e `flowState.mjs record-manifest` / `diff-manifest`. Il
branch effettivo di ogni task vive nello **stato** (`set-branch`), incluso il branch base per la PR
di Fase 5. Nei progetti senza git la deroga si registra
(`record-override --gate branch --reason "…"`) e il sequencer chiede il manifest al suo posto.

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

### `output` - lo stile di output del progetto

| Chiave | Default | Effetto |
|---|---|---|
| `style` | `"kit"` | Lo stile "AI-Dev Flow" (output essenziale nel flusso, domande e gate completi). L'install lo seleziona scrivendo `outputStyle` in `.claude/settings.json` col nome namespaced `ai-dev-flow:AI-Dev Flow`. `"inherit"` non tocca lo stile del progetto; un altro valore seleziona uno stile tuo. |

*Letta da*: install (`.claude/settings.json`). Lo stile vive nel plugin (`output-styles/`) e non
viene copiato nel progetto; l'uninstall rimuove la selezione solo se non l'hai cambiata.

### `models` - il tier del thread principale e l'escalation

| Chiave | Default | Effetto |
|---|---|---|
| `mainThread` | `"sonnet"` | Il tier di default del **thread** (orchestrazione + implementazione) in questo progetto: l'install lo scrive come `"model"` in `.claude/settings.json`. `"inherit"` non scrive nulla (decidi tu sessione per sessione). |
| `escalation` | `"opus"` | Il tier proposto quando il lavoro si rivela più difficile del previsto. |
| `escalateAfterRedRounds` | `2` | Dopo quanti giri di test rossi il sequencer propone l'escalation. `0` = mai. |

*Letta da*: install (`.claude/settings.json`), sequencer (proposta di escalation), skill flow (Gate 2).
**Non** governa i sub-agent: il loro tier sta nel frontmatter dell'agente e si cambia aggiornando il
kit, non da qui. Cambiandola con `flow-settings`, va riallineata anche la chiave `"model"` di
`.claude/settings.json` (come per la telemetria, la config è l'intento, il settings è ciò che applica).

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

### `delivery` - quali passi di consegna pretende il sequencer

| Chiave | Default | Effetto |
|---|---|---|
| `specTicketComment` | `true` | Commento sul ticket a spec approvata (fine Fase 1). `false` = il sequencer non lo chiede. |
| `pr` | `true` | Proposta di PR in Fase 5. `false` = niente PR (la consegna è il solo ticket). |
| `ticketUpdate` | `true` | Update di stato del ticket alla consegna. `false` = il sequencer e il guardiano non lo pretendono. |
| `ticketStatus` | `null` | Lo stato di arrivo di default (es. `"Review"`): se valorizzato, alla consegna non viene chiesto. |

*Letta da*: sequencer (`flowState next`), guardiano di fine turno.
È la forma giusta di una scelta **stabile** del progetto: la stessa deroga ripetuta a ogni task va
trasformata in una chiave qui (decisione committata), non ripetuta.

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

Lo stato non si configura: vive in `.ai-dev/tasks/<id>/state.json` ed è gestito esclusivamente da `bin/flowState.mjs`. Comandi: `start` (avvia/riprende), **`next`** (il sequencer: il prossimo passo calcolato dai fatti), **`report`** (durate per passo dal log: dove è andato il tempo), `show`, `approve-gate <spec|plan|diff>`, `set-branch`, `record-spec`, `record-tests-authored`, `record-snapshot`, **`record-manifest`** / **`diff-manifest`**
(manifest "prima" e inventario per confronto, nei progetti senza git), `record-verification`, `record-doc-review`, `record-changelog`, `record-ticket-update`, `record-pr`, `record-override` (deroghe, sempre con motivo), `close` e **`abort --reason`** (abbandono governato, con compensazioni). È committabile (riprendibilità e handoff), versionato (`stateVersion`) e coperto dalle migrazioni.
