# AI-Dev Flow

Plugin Claude Code per uno sviluppo software AI-assistito (human-in-the-loop), **abilitabile e
configurabile per singolo progetto**.

> Versione **0.0.8** — beta. Finché siamo sotto `1.0.0` anche piccoli incrementi
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
adatto** (spec-author/test-author sul modello top, intake/test-runner su quello economico,
doc-author su quello intermedio) e vale il **perimetro dello standard**: nei progetti col kit si
usano SOLO componenti del kit (hook di enforcement). Entrypoint: la skill **`flow`**
(«lavora su questo ticket»).

Dalla **0.0.8** anche la *direzione* del flusso è deterministica: il **sequencer**
(`flowState.mjs next`) calcola il prossimo passo dai fatti registrati — l'orchestratore esegue un
loop `next → esegui → registra`, non decide la sequenza a memoria (niente single-point-of-failure
cognitivo). E l'abbandono di un task è governato: `flowState.mjs abort --reason` chiude lo stato
ed elenca le compensazioni (branch da eliminare, ticket da annotare).

È confezionato come **plugin Claude Code**: il processo, le skill e i template restano agnostici nel
contenuto; il plugin è l'adattatore per Claude Code (skill invocabili + hook di qualità). Si abilita
**per singolo progetto**, mai globalmente: skill e hook sono attivi solo nei progetti che lo abilitano.

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

## Essenzialità del codice (Ponytail)

Il kit non reimplementa l'essenzialità: si appoggia al plugin esterno
[Ponytail](https://github.com/DietrichGebert/ponytail) (un ruleset che fa scrivere solo il codice
necessario). Quando `flow.config.tokenEconomy.ponytail` ≠ `"off"`, l'install **abilita Ponytail
per-progetto** insieme al kit (stesso meccanismo `enabledPlugins`/`extraKnownMarketplaces`). La
modalità (`lite`|`full`|`ultra`) segue quel flag; l'impl-runbook la allinea con `/ponytail <modalità>`.

## Telemetria (Fase 2)

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
├── agents/                      sub-agent per-fase, ciascuno col suo modello:
│   ├── intake.md                Fase 0 — normalizzazione richiesta (haiku)
│   ├── spec-author.md           Fase 1 — bozza spec + impact analysis (opus)
│   ├── test-author.md           Fase 2 — test dalla sola spec, isolato (opus)
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
├── templates/                   modelli degli artefatti (spec, plan, changelog, architecture, …)
├── bin/
│   ├── flowState.mjs            stato per-task (libreria + CLI) + sequencer `next` + `abort`
│   ├── telemetry.mjs            riallineamento blocchi OTEL (.envrc/settings) ↔ flow.config
│   ├── install.mjs              installer deterministico per-progetto (scrive un manifest)
│   ├── uninstall.mjs            disinstaller per-progetto (legge il manifest, ripulisce)
│   └── migrate.mjs              motore di migrazione per-progetto (idempotente, transazionale)
└── project-files/               template di config e lock per-progetto
```

## Documentazione di design

In [`docs/`](docs/) trovi il **manuale di progetto** (architettura, fasi, contratti, esempi d'uso —
il documento da cui partire), la gap analysis (razionale delle scelte 0.0.7), la presentazione per
il team (`.pptx`) e i diagrammi di processo (`.drawio`, corrente: V5).

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
