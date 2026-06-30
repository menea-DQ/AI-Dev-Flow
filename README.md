# AI-Dev Flow

Plugin Claude Code per uno sviluppo software AI-assistito (human-in-the-loop), **abilitabile e
configurabile per singolo progetto**.

> Versione **0.0.2** — beta. Finché siamo sotto `1.0.0` anche piccoli incrementi
> possono introdurre cambiamenti non retro-compatibili (convenzione semver per le 0.x).

## Cos'è

Il kit prende il processo di sviluppo AI-assistito e lo rende uno **standard unico, ripetibile e
configurabile**, applicabile a ogni progetto. L'AI esegue, la persona decide nei tre punti chiave
(specifica, piano, revisione del diff). La fonte di verità del processo è [`PROCESS.md`](PROCESS.md).

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
L'install NON chiede quale tool usare: i default sono `productive` e `zammad`. Le credenziali stanno
in variabili d'ambiente (vedi [`connectors/.env.example`](connectors/.env.example)). Per cambiare
connettore (o aggiungerne uno, es. Jira) si tocca solo `flow.config`, senza reimplementare nulla.
Vedi [`connectors/README.md`](connectors/README.md) per il contratto.

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
espongono). Il kit quindi **non usa DB o connettori custom**: abilita l'OTEL **per-progetto** (blocco
`env` nel `.claude/settings.json`, scritto dall'install — attivo solo in quel progetto, mai nelle altre
chat) e lo manda a uno **stack OTLP standard** con **Grafana**. OTLP è il layer agnostico: cambi backend
cambiando l'endpoint, senza riscrivere nulla. Dettagli e stack in [`telemetry/`](telemetry/). Si
disattiva con `flow.config.telemetry.enabled = false`; l'uninstall rimuove le variabili.

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
├── PROCESS.md                   fonte di verità del processo
├── INSTALL.md                   procedura di installazione per-progetto
├── skills/<nome>/SKILL.md       install, uninstall, migrate, flow-settings, connectors-check + skill di processo
├── agents/test-author.md        sub-agent isolato che scrive i test dalla sola spec
├── hooks/
│   ├── hooks.json               aggancio agli eventi nativi (SessionStart, PreToolUse, Stop)
│   ├── README.md                cosa fa ogni hook
│   └── scripts/*.mjs            script degli hook (guardia: no-op se manca flow.config.json)
├── connectors/                  connettori ticketing/helpdesk pronti + contratto + check.mjs (contract-check)
├── telemetry/                   stack OTLP + Grafana (docker-compose) per la telemetria (Fase 2)
├── migrations/                  migrazioni di formato versionate (<from>-to-<to>.mjs) + convenzione
├── templates/                   modelli degli artefatti (spec, plan, changelog, architecture, …)
├── bin/
│   ├── install.mjs              installer deterministico per-progetto (scrive un manifest)
│   ├── uninstall.mjs            disinstaller per-progetto (legge il manifest, ripulisce)
│   └── migrate.mjs              motore di migrazione per-progetto (idempotente, transazionale)
└── project-files/               template di config e lock per-progetto
```

## Documentazione di design

In [`docs/`](docs/) trovi il documento di revisione (architettura + razionale), la presentazione per
la direzione e i diagrammi di processo (`.drawio`).

## Versione

Vedi [`VERSION`](VERSION). Versionamento semantico.
