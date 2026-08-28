# AI-Dev Flow

Plugin Claude Code per uno sviluppo software AI-assistito (human-in-the-loop), **abilitabile e
configurabile per singolo progetto**.

> Versione **0.5.0** — beta. Finché siamo sotto `1.0.0` anche piccoli incrementi
> possono introdurre cambiamenti non retro-compatibili (convenzione semver per le 0.x).

## Cos'è

Il kit prende il processo di sviluppo AI-assistito e lo rende uno **standard unico, ripetibile e
configurabile**, applicabile a ogni progetto. L'AI esegue, la persona decide nei tre punti chiave
(specifica, piano, revisione del diff). La fonte di verità del processo è [`PROCESS.md`](PROCESS.md).

Dalla **0.0.7** il flusso è **garantito, non solo prescritto**: ogni task ha uno **stato
persistito** (`.ai-dev/tasks/<id>/state.json` — riprendibile, passabile tra colleghi) e gli hook
sono i **guardiani dei contratti di fase** (niente codice senza spec+piano approvati e branch di
lavoro; niente chiusura senza test, doc-review, changelog e ticket aggiornato — o skip espliciti e
registrati). Le fasi sono **sei** (intake → specifica → implementazione → qualità → documentazione
→ consegna con PR), il lavoro cognitivo è svolto da **agenti dedicati per fase con il modello
adatto** (spec-author/plan-author sul modello top, test-author/doc-author su quello intermedio,
intake/test-runner su quello economico) e vale il **perimetro dello standard**: nei progetti col kit si
usano SOLO componenti del kit (hook di enforcement). Entrypoint: la skill **`flow`**
(«lavora su questo ticket»).

Dalla **0.0.8** anche la *direzione* del flusso è deterministica: il **sequencer**
(`flowState.mjs next`) calcola il prossimo passo dai fatti registrati — l'orchestratore esegue un
loop `next → esegui → registra`, non decide la sequenza a memoria (niente single-point-of-failure
cognitivo). E l'abbandono di un task è governato: `flowState.mjs abort --reason` chiude lo stato
ed elenca le compensazioni (branch da eliminare, ticket da annotare).

Dalla **0.2.0** il flusso è anche **economico per costruzione**: il costo di un task non cresce col
numero di task già svolti. Changelog e specifiche hanno una **parte normativa breve** che le fasi a
valle leggono (testa «Vincolante» con tetto di 15 righe; parte normativa della spec autosufficiente)
e una **narrativa** che si scrive sempre ma non si rilegge per intero; le **misure** si citano dalla
fonte primaria (gli input di Fase 0 in `.ai-dev/tasks/<id>/inputs/`, ora nel contratto d'ingresso
della Fase 1); ogni clausola della spec passa un **controllo di osservabilità** prima del gate (il
test-author lavora alla cieca: ciò che non è osservabile diventerebbe un secondo passaggio della
fase più cara); il **tier del modello** dichiarato nel frontmatter degli agenti non si sovrascrive
alla chiamata. Nei progetti **senza git**, l'inventario del GATE 3 si ottiene per confronto con un
manifest catturato a codice intatto (`flowState.mjs record-manifest` / `diff-manifest`), non con una
ricerca a timestamp. Nessun presidio è stato rimosso: i sub-agent isolati, i tre gate umani e la
Fase 4 come revisione restano invariati.

Dalla **0.3.0** il tier del modello è dichiarato **anche per il thread principale**, dove fino a ieri
era quello della sessione — cioè un fatto incidentale. Il principio: il modello top si paga dove si
DECIDE, non dove si esegue. Il piano di Fase 2 diventa quindi un sub-agent dedicato
(**`plan-author`**, modello top, contesto isolato: è l'unica lettura profonda della codebase del
flusso, e la spec resta pulita dal COME perché è l'unico input del test-author); `test-author` scende
al tier intermedio, perché la parte normativa autosufficiente e gli osservabili per clausola rendono
la derivazione meccanica; il **thread principale** (orchestrazione + implementazione di un piano già
approvato) ha un default di progetto in `flow.config.models.mainThread`, scritto dall'install in
`.claude/settings.json`. L'**escalation** al tier alto è una decisione umana in due punti dichiarati:
al GATE 2, informata dalle *note di complessità* del plan-author, oppure proposta dal **sequencer**
al ripetersi dei giri di test rossi (`record-verification --status failed`) — un segnale oggettivo,
non una stima ex-ante. Registrata come deroga, mai silenziosa. Nella stessa release, due correzioni
trovate testando: il guardiano di fine turno non considera più soddisfatta una verifica **rossa** (un
rosso registrato non fa chiudere il turno), e nei progetti **senza git** il sequencer salta il passo
della PR invece di inciamparci, mantenendo però l'obbligo di aggiornare il ticket.

Dalla **0.5.0** il flusso è **veloce dove non decide nessuno** — release guidata dalle misure sui
primi 13 task reali, senza toccare i presidi (gate, test prima del codice, hook). Quattro interventi:
il **gate di verifica si ri-arma solo se cambia il codice coperto dal playbook** (hash sul contenuto
dei file nei `pathPatterns`, non sull'intero diff git: doc, changelog e commit non forzano più
ri-verifiche spurie — 7 task su 13 ne pagavano); il **test-author riceve la *ricetta* dei test**
(playbook, convenzioni, testPaths, test esistenti in lettura — mai piano né codice: la spec resta
l'unica fonte di ciò che va asserito, ma il framework non si riscopre più a ogni task); il
**fast-path taglia i sub-agent redazionali, mai i gate** (niente plan-author: il piano compresso
viene dalla spec e passa comunque dal Gate 2; doc-review in linea); i **passi di consegna sono
configurabili per-progetto** (`flow.config.delivery`: la stessa deroga ripetuta a ogni task diventa
una chiave committata). E il sequencer diventa **strumento di misura**: registra gli inizi-azione
nel log dello stato (`sequencer → <passo>`), così gli intervalli fra i gate distinguono il tempo
macchina dall'attesa umana.

È confezionato come **plugin Claude Code**: il processo, gli artefatti e i template restano agnostici
nel contenuto; il **plugin** (skill, hook, agenti, connettori) è lo strato adattatore per Claude Code.
Si abilita **per singolo progetto**, mai globalmente: skill e hook sono attivi solo nei progetti che
lo abilitano.

## Installare su un progetto

Questo repo è **insieme marketplace e plugin**. Due strade equivalenti.

**A. Via marketplace (consigliata per il team)** — una volta sola per progetto:

```
/plugin marketplace add menea-DQ/AI-Dev-Flow
/plugin install ai-dev-flow@ai-dev-flow --scope project
```

`--scope project` scrive l'abilitazione nel `.claude/settings.json` committato del progetto: chiunque
apra quel repo trova plugin e hook attivi, e nessun altro progetto ne è toccato. Poi invoca la skill
`install` per lo scaffolding degli artefatti (intervista inclusa).

**B. Da una copia locale** — l'installer abilita lui stesso il plugin nel progetto e scaffolda:

```
node "<path-al-plugin>/bin/install.mjs" --project "$(pwd)"
```

Riapri il progetto in Claude Code per attivare plugin e hook.

In entrambi i casi l'install è **per-progetto** (mai globale), **transazionale** (rollback in caso di
errore) e **idempotente**. L'intervista del Passo 3 **chiede** strategia di test e convenzioni: non le inferisce.

## Connettori (ticketing / helpdesk)

L'interfaccia dei connettori è **agnostica e sostituibile**, ma il kit ne ship già due **pronti**:
**Productive** (ticketing) e **Zammad** (helpdesk) — perché in azienda si usano sempre questi.
L'install NON chiede quale tool usare: i default sono `productive` e `zammad`. Le credenziali vanno nel
file **`.ai-dev/connectors.env` del progetto** (gitignorato; l'install lo scaffolda da
[`connectors/.env.example`](connectors/.env.example)) — i connettori lo **caricano da soli** prima di
leggere le credenziali (le variabili già esportate nell'ambiente hanno comunque la precedenza). Per cambiare
connettore (o aggiungerne uno, es. Jira) si tocca solo `flow.config`, senza reimplementare nulla.
Vedi [`connectors/README.md`](connectors/README.md) per il contratto. Il connettore Productive **scarica
gli allegati del task** in `.ai-dev/attachments/productive-<id>/` (cartella gitignorata) e li elenca
nell'output col percorso locale, così l'agente può aprirli (es. screenshot).

**Contract-check** (Fase 2): la skill `connectors-check` (o `node "<plugin>/connectors/check.mjs"`)
verifica che i connettori configurati rispondano ancora come previsto (auth + raggiungibilità +
contratto), segnalando le rotture (token scaduto, API cambiata) **prima** che blocchino il lavoro.
Lo eseguono anche il doctor e l'intake-parser come pre-controllo.

Dalla **0.4.0** il kit tratta l'**attenzione** dell'utente come una risorsa, esattamente come i
token: il flusso gira in automatico, quindi la narrazione non viene letta e in più sommerge le due
sole cose che vanno lette — i gate e le domande. La regola è **poco mentre lavori, molto quando
chiedi**: una riga per passo del sequencer, gli artefatti su FILE con il percorso a schermo (le bozze
di spec e piano nascono in `.ai-dev/tasks/<id>/`, non più solo nella conversazione), e ai gate ciò
che serve a decidere invece dell'artefatto ricopiato. Le **domande** hanno un contratto: cosa si
decide, perché la si chiede ora (con la fonte precisa), cosa cambia in base alla risposta, 2-4 opzioni
con la loro conseguenza — e quelle dei sub-agent si **riscrivono**, non si inoltrano, perché chi le ha
scritte aveva in testa spec e codice e chi risponde non ha letto niente. Il veicolo è un **output
style** consegnato dal plugin (`output-styles/`), selezionato per-progetto dall'install: non viene
copiato nei progetti e resta cambiabile dall'utente.

## Tier dei modelli

| Dove | Tier | Come è garantito |
| --- | --- | --- |
| `intake` (F0), `test-runner` (F3) | economico (haiku) | frontmatter dell'agente |
| `spec-author` (F1), `plan-author` (F2) | top (opus) | frontmatter dell'agente |
| `test-author` (F2), `doc-author` (F4) | intermedio (sonnet) | frontmatter dell'agente |
| Thread principale: orchestrazione + implementazione | intermedio (sonnet) | default di progetto in `flow.config.models.mainThread` → `"model"` in `.claude/settings.json` |

Il frontmatter di un sub-agent **vince sempre** sul modello di sessione: le fasi che richiedono il
modello top non dipendono da come è configurato il thread. Il contrario non vale — il tier del thread
è un **default**, non un vincolo imponibile: l'utente può cambiarlo con `/model` e il kit non ha modo
di accorgersene (limite dichiarato). L'**escalation** al tier alto durante un task è una decisione
umana registrata come deroga (`record-override --gate model-tier`), proposta al GATE 2 dalle note di
complessità del plan-author o dal sequencer dopo `escalateAfterRedRounds` giri di test rossi.
Si cambia con `flow-settings` (che riallinea anche `.claude/settings.json`); il tier dei sub-agent
no: quello vive nel kit e si cambia aggiornando il plugin.

## Essenzialità del codice (Ponytail)

Il kit non reimplementa l'essenzialità: si appoggia al plugin esterno
[Ponytail](https://github.com/DietrichGebert/ponytail) (un ruleset che fa scrivere solo il codice
necessario). Quando `flow.config.tokenEconomy.ponytail` ≠ `"off"`, l'install **abilita Ponytail
per-progetto** insieme al kit (stesso meccanismo `enabledPlugins`/`extraKnownMarketplaces`). La
modalità (`lite`|`full`|`ultra`) segue quel flag; l'impl-runbook la allinea con `/ponytail <modalità>`.

## Telemetria

I dati di costo/uso accurati vengono solo dall'**OpenTelemetry nativo** di Claude Code (gli hook non li
espongono). Il kit quindi **non usa DB o connettori custom**: abilita l'OTEL **per-progetto** e lo manda
a uno **stack OTLP standard** con **Grafana**. OTLP è il layer agnostico: cambi backend cambiando
l'endpoint, senza riscrivere nulla.

L'abilitazione OTEL è una config di **startup** di Claude Code: per restare per-progetto, l'install scrive
le variabili OTEL in un **`.envrc`** (direnv — entrando nella cartella si attivano, uscendo si disattivano)
**e** nel `.claude/settings.json` del progetto. Il `.envrc` è ciò che le attiva nel processo `claude` al
lancio; richiede `direnv` + un `direnv allow` iniziale. Tra le variabili,
`OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative` è necessaria perché Prometheus accetti le
metriche. Dettagli e stack in [`telemetry/`](telemetry/). Si disattiva con
`flow.config.telemetry.enabled = false`; l'uninstall rimuove tutto (blocco `.envrc` + variabili settings.json).

## Cambiare le impostazioni di un progetto

Invoca la skill `flow-settings`: «cambia come si fanno i test», «aggiungi una convenzione di progetto»,
«modifica le soglie». Modifica solo i tuoi override locali (`flow.config.json`), mai il core del plugin.

## Disinstallare da un progetto

Invoca la skill `uninstall` (oppure `node "<plugin>/bin/uninstall.mjs" --project "$(pwd)"`). Disabilita
il plugin nel progetto, rimuove il blocco da `CLAUDE.md` e cancella gli artefatti dell'install. I file
che possono contenere lavoro tuo (config, architecture, changelog) vengono **preservati se modificati**,
salvo `--purge` che rimuove tutto.

## Aggiornare il kit

Aggiorna il plugin con `/plugin marketplace update ai-dev-flow`. Poi, **per-progetto**, invoca la skill
`migrate` (o `node "<plugin>/bin/migrate.mjs" --project "$(pwd)"`): porta gli artefatti del progetto
dalla versione installata a quella corrente, applicando le migrazioni di formato (vedi
[`migrations/`](migrations/)). È idempotente e transazionale; i tuoi override non vengono persi. Un
**drift-notice** a inizio sessione ti ricorda di migrare dove la versione è vecchia.

## Struttura del repo (marketplace + plugin)

```
AI-Dev-Flow/                     radice = marketplace + plugin
├── .claude-plugin/
│   ├── marketplace.json         dichiara il marketplace e il plugin (source "./")
│   └── plugin.json              manifest del plugin
├── README.md                    questo file
├── VERSION                      versione semantica
├── PROCESS.md                   fonte di verità del processo (6 fasi, 3 gate, stato per-task)
├── INSTALL.md                   procedura di installazione per-progetto
├── skills/<nome>/SKILL.md       flow (ENTRYPOINT), doctor, install, uninstall, migrate,
│                                flow-settings, connectors-check + skill di processo
├── output-styles/               stile di output del kit (essenziale nel flusso, completo ai gate)
├── agents/                      sub-agent per-fase, ciascuno col suo modello:
│   ├── intake.md                Fase 0 — normalizzazione richiesta (haiku)
│   ├── spec-author.md           Fase 1 — bozza spec + impact analysis (opus)
│   ├── plan-author.md           Fase 2 — piano dalla spec approvata (opus)
│   ├── test-author.md           Fase 2 — test dalla spec (unica fonte del COSA) + ricetta dei test, isolato dal COME (sonnet)
│   ├── test-runner.md           Fase 3 — esecuzione test (haiku)
│   └── doc-author.md            Fase 4 — doc-review + changelog (sonnet)
├── hooks/
│   ├── hooks.json               aggancio agli eventi nativi (SessionStart, PreToolUse, Stop)
│   ├── README.md                cosa fa ogni hook (guardiani dei contratti di fase)
│   └── scripts/*.mjs            preEditGuard, preBashGuard, perimeterGuard, preWorkSnapshot,
│                                postWorkVerification, versionDrift (no-op se manca flow.config.json)
├── connectors/                  connettori pronti (lettura + scritture --update-status/--comment)
├── telemetry/                   stack OTLP + Grafana (docker-compose) per la telemetria
├── migrations/                  migrazioni di formato versionate (<from>-to-<to>.mjs) + convenzione
├── templates/                   modelli degli artefatti (spec e changelog in due parti: normativa
│                                + narrativa; plan, architecture, qa-log, AGENT)
├── bin/
│   ├── flowState.mjs            stato per-task (libreria + CLI) + sequencer `next` + `abort`
│   │                            + manifest "prima" per i progetti senza git (record/diff-manifest)
│   ├── telemetry.mjs            riallineamento blocchi OTEL (.envrc/settings) ↔ flow.config
│   ├── install.mjs              installer deterministico per-progetto (scrive un manifest)
│   ├── uninstall.mjs            disinstaller per-progetto (legge il manifest, ripulisce)
│   └── migrate.mjs              motore di migrazione per-progetto (idempotente, transazionale)
└── project-files/               template di config e lock per-progetto
```

## Documentazione di design

In [`docs/`](docs/) trovi il **manuale di progetto** (architettura, fasi, contratti, esempi d'uso —
il documento da cui partire), il diagramma di processo corrente (`AI Dev Flow V5.drawio`) e la
**proposta di riduzione costi** da cui nasce la 0.2.0 (`proposta-riduzione-costi.md`: le misure di
un task reale, la diagnosi e i sei interventi). Gli
artefatti storici e di lavoro (gap analysis chiusa, presentazione per il team `.pptx`, diagramma V4)
sono in [`docs/archive/`](docs/archive/).

## Note tecniche sul manifest del plugin

Due insidie da conoscere se tocchi `.claude-plugin/`:
- `skills/`, `agents/` e `hooks/hooks.json` sono **auto-scoperti**: NON dichiarare `hooks/hooks.json`
  nel campo `hooks` del manifest — causa un doppio caricamento (errore "Duplicate hooks file").
  Quel campo serve solo per file di hook aggiuntivi/non standard.
- Nel `marketplace.json`, la sorgente del plugin alla radice del repo è `"./"` — il path relativo
  DEVE iniziare con `./` (`"."` viene rifiutato dallo schema). Per ospitare più plugin, un domani:
  sottocartelle e `source: "./plugins/<nome>"`.

## Versione

Vedi [`VERSION`](VERSION). Versionamento semantico.
