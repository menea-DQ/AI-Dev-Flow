# AI-Dev Flow — Kit MVP (Fase 1) — Documento di revisione

> Questo documento descrive l'architettura del kit così com'è **implementata nel repo** `AI-Dev-Flow`.
> Il repo è la fonte di verità (codice e file reali); questo documento è la vista d'insieme con il
> *perché* di ogni scelta. Dove utile riporto il contenuto dei file più brevi; per i file di prosa
> (PROCESS.md, INSTALL.md) il testo canonico vive nel repo.
>
> **Forma del kit.** Il kit è un **plugin Claude Code**, confezionato in un repo che è insieme
> **marketplace e plugin**. Si **abilita per singolo progetto** (mai globalmente): skill e hook sono
> attivi solo nei progetti che lo abilitano. Il *processo*, le *skill* (nel contenuto) e i *template*
> restano agnostici dal tool; il plugin è l'adattatore per Claude Code.
>
> **Principi portanti** (nati dall'analisi di un progetto reale gestito a mano, poi generalizzati):
> (1) la **regola del 98%** di comprensione prima di agire; (2) i **documenti di architettura
> per-contesto** come knowledge-store; (3) un **test-playbook per-progetto dichiarato** (chiesto,
> non inferito); (4) le **convenzioni di progetto esplicite**; (5) un **gate pre-work di snapshot**
> per le modifiche ai dati. L'installazione è un'**intervista** (chiede), non un'inferenza.

---

## Struttura del repo (marketplace + plugin)

```
AI-Dev-Flow/                         radice = marketplace + plugin
├── .claude-plugin/
│   ├── marketplace.json             dichiara il marketplace e il plugin (source "./")
│   └── plugin.json                  manifest del plugin (name, version, keywords)
├── README.md
├── VERSION                          0.0.2
├── PROCESS.md                       fonte di verità del processo
├── INSTALL.md                       procedura di installazione per-progetto
│
├── skills/                          skill auto-scoperte dal plugin (cartella per skill)
│   ├── install/SKILL.md             ENTRYPOINT: scaffolding per-progetto
│   ├── uninstall/SKILL.md           rimuove il kit dal progetto e ripulisce gli artefatti
│   ├── migrate/SKILL.md             aggiorna gli artefatti per-progetto alla versione corrente
│   ├── flow-settings/SKILL.md       modifica guidata di flow.config.json
│   ├── connectors-check/SKILL.md    contract-check dei connettori configurati
│   ├── intake-parser/SKILL.md       normalizza la richiesta (CR/BUG) via connettore
│   ├── spec-context/SKILL.md        cosa caricare per la spec (legge gli architecture doc)
│   ├── impl-runbook/SKILL.md        convenzioni di implementazione (da flow.config)
│   └── test-selector/SKILL.md       quali test, secondo il test-playbook
│
├── agents/
│   └── test-author.md               sub-agent isolato che scrive i test dalla sola spec
│
├── hooks/
│   ├── hooks.json                   aggancio agli eventi nativi (SessionStart, PreToolUse, Stop)
│   ├── README.md                    cosa fa ogni hook + gli eventi che restano agent-driven
│   └── scripts/
│       ├── hookShared.mjs           utility (stdin, config, glob→regex, marker, guardia)
│       ├── versionDrift.mjs         SessionStart: avvisa se la versione installata è vecchia
│       ├── preEditGuard.mjs         file di test read-only durante l'implementazione
│       ├── preWorkSnapshot.mjs      snapshot "before" su modifiche ai dati
│       └── postWorkVerification.mjs verifica post-work dal test-playbook (evento Stop)
│
├── connectors/                      connettori ticketing/helpdesk PRONTI + contratto agnostico
│   ├── README.md                    il contratto (interfaccia) per aggiungere/sostituire connettori
│   ├── contract.schema.json         schema dell'output normalizzato (usato dal contract-check)
│   ├── check.mjs                    contract-check: probe auth/raggiungibilità + validazione forma
│   ├── productive.mjs               ticketing: Productive (REST) + modalità --check
│   ├── zammad.mjs                   helpdesk: Zammad (REST, cookie CF opzionale) + --check
│   └── .env.example                 variabili d'ambiente delle credenziali
│
├── telemetry/                       stack OTLP + Grafana per la telemetria (Fase 2)
│   ├── docker-compose.yml           grafana/otel-lgtm (OTLP-in + Prometheus/Loki/Tempo + Grafana)
│   └── README.md                    cosa cattura, come gira, wiring per-progetto via settings.json env
│
├── migrations/                      migrazioni di formato versionate
│   └── README.md                    convenzione <from>-to-<to>.mjs + il context delle migrazioni
│
├── templates/                       spec, plan, changelog, qa-log, architecture,
│   └── …                            test-playbook, AGENT.md, CLAUDE.md
│
├── bin/
│   ├── install.mjs                  installer deterministico, transazionale, PER-PROGETTO (scrive un manifest)
│   ├── uninstall.mjs                disinstaller per-progetto (legge il manifest, ripulisce in sicurezza)
│   └── migrate.mjs                  motore di migrazione per-progetto (idempotente, transazionale)
│
└── project-files/
    ├── flow.config.template.json    config per-progetto (override locali)
    └── flow.lock.template.json      lockfile (versione + cache assessment + manifest install)
```

**Cosa va dove, in breve.** Il plugin (skill, hook, template, processo) vive nel repo e si abilita
per-progetto. Nel **progetto** finiscono solo: l'abilitazione del plugin nel suo `.claude/settings.json`,
`flow.config.json`, `flow.lock.json`, gli artefatti di lavoro (spec, piani, changelog, documenti di
architettura per-contesto) e i riferimenti in `AGENT.md`/`CLAUDE.md`. Le skill e gli hook **non**
vengono copiati nel progetto: li fornisce il plugin.

---

## 1. `VERSION` e versionamento

```
0.0.2
```

`0.0.x` è la fase **beta**: finché siamo sotto `1.0.0`, anche piccoli incrementi possono introdurre
cambiamenti non retro-compatibili (convenzione semver per le 0.x). Il manifest del plugin e il lockfile
per-progetto dichiarano la versione; il passaggio `0.0.1 → 0.0.2` ha una migrazione che allinea gli
artefatti dei progetti già installati (vedi `migrations/`).

---

## 2. Il plugin: `plugin.json` e `marketplace.json`

Il repo è insieme **marketplace** (cataloga i plugin) e **plugin** (alla radice). I due file vivono
entrambi in `.claude-plugin/`.

`.claude-plugin/plugin.json`
```json
{
  "name": "ai-dev-flow",
  "displayName": "AI-Dev Flow",
  "version": "0.0.2",
  "description": "Processo di sviluppo software AI-assistito (human-in-the-loop), abilitabile e configurabile per singolo progetto.",
  "author": { "name": "Massimiliano Enea", "email": "massimiliano.enea@donq.io" },
  "repository": "https://github.com/menea-DQ/AI-Dev-Flow",
  "license": "UNLICENSED",
  "keywords": ["devflow", "human-in-the-loop", "spec-driven", "tdd", "non-regression", "claude-code"]
}
```

`.claude-plugin/marketplace.json`
```json
{
  "name": "ai-dev-flow",
  "owner": { "name": "Massimiliano Enea", "email": "massimiliano.enea@donq.io" },
  "description": "Marketplace del kit AI-Dev Flow.",
  "plugins": [
    { "name": "ai-dev-flow", "source": "./", "description": "Processo AI-assistito human-in-the-loop." }
  ]
}
```

**Perché così.** `skills/`, `agents/` e `hooks/hooks.json` sono **auto-scoperti** dal plugin (basta la
cartella/posizione standard), quindi non serve dichiararli nel manifest — anzi, dichiarare
`hooks/hooks.json` nel campo `hooks` causa un doppio caricamento (errore "Duplicate hooks file"): il
campo `hooks` si usa solo per file di hook aggiuntivi/non standard. La sorgente del plugin nel
marketplace è `"./"` (il path relativo DEVE iniziare con `./`;
`"."` viene rifiutato dallo schema): `"./"` indica il plugin alla radice del repo, pattern
"repo = singolo plugin". Se un domani servisse ospitare più plugin, basta spostare ciascuno in una
sottocartella e usare `source: "./plugins/<nome>"`.

---

## 3. Installazione PER-PROGETTO (mai globale)

Due strade equivalenti, entrambe **scoped al singolo progetto**.

**A. Via marketplace** (consigliata per il team), una volta per progetto:
```
/plugin marketplace add menea-DQ/AI-Dev-Flow
/plugin install ai-dev-flow@ai-dev-flow --scope project
```
`--scope project` scrive l'abilitazione nel `.claude/settings.json` **committato** del progetto:
chiunque apra quel repo trova plugin e hook attivi, e nessun altro progetto ne è toccato.

**B. Da copia locale**, l'installer abilita lui stesso il plugin nel progetto e scaffolda:
```
node "<path-al-plugin>/bin/install.mjs" --project "$(pwd)"
```

In entrambi i casi, l'abilitazione per-progetto è questa (scritta nel `.claude/settings.json` del progetto):
```json
{
  "enabledPlugins": { "ai-dev-flow@ai-dev-flow": true },
  "extraKnownMarketplaces": {
    "ai-dev-flow": { "source": { "source": "github", "repo": "menea-DQ/AI-Dev-Flow" } }
  }
}
```

**Perché così.** È il meccanismo ufficiale di Claude Code per abilitare un plugin **solo in un progetto**:
gli hook del plugin scattano unicamente nei progetti dove è abilitato. Il marketplace può puntare a
GitHub (portabile per il team) o a una **directory locale** (per sviluppo): l'installer deduce la
sorgente dal remote del kit, con fallback alla directory locale.

### `INSTALL.md` (procedura, eseguita dalla skill `install`)

L'ordine è sacro: **assessment in sola lettura → report → INTERVISTA → installazione transazionale →
doctor**. Il cambiamento chiave rispetto alla prima stesura è il **Passo 3**: non più "chiedi solo se
ambiguo" ma un'**intervista** che chiede attivamente le scelte, e mette nero su bianco le due cose che
il kit **non deve mai dedurre**: la **strategia di test** (test-playbook) e le **convenzioni di
progetto**. Il Passo 4 abilita il plugin per-progetto e scaffolda gli artefatti; skill e hook NON
vengono copiati (li fornisce il plugin). Testo canonico in `INSTALL.md` del repo.

---

## 4. Le skill (auto-scoperte dal plugin)

Ogni skill è `skills/<nome>/SKILL.md` con frontmatter (`name`, `description`). Cinque sono di *servizio*
(entrypoint che l'utente invoca), quattro sono di *processo* (usate dalle fasi).

- **install** — esegue `INSTALL.md` (assessment → intervista → installer → doctor). Lancia l'installer
  bundlato nel plugin: `node "<plugin>/bin/install.mjs" --project "$(pwd)" [--decisions <file.json>]`.
- **uninstall** — rimuove il kit dal progetto (`node "<plugin>/bin/uninstall.mjs" --project "$(pwd)"`):
  disabilita il plugin, rimuove il blocco da `CLAUDE.md`, cancella gli artefatti. Preserva i file che
  l'utente ha modificato (config/architecture/changelog) salvo `--purge`.
- **migrate** — aggiorna gli artefatti per-progetto alla versione corrente del kit
  (`node "<plugin>/bin/migrate.mjs" --project "$(pwd)"`): applica le migrazioni di formato, idempotente,
  transazionale, no downgrade.
- **flow-settings** — editor guidato di `flow.config.json`: test-playbook, convenzioni di progetto,
  `architectureDocs`, `dataProducingPaths`, soglie, connettori. Scrive SOLO `flow.config.json`, mai il
  core del plugin. Mostra un diff e l'effetto pratico prima di salvare.
- **connectors-check** — contract-check dei connettori (`node "<plugin>/connectors/check.mjs"`): probe
  auth/raggiungibilità + validazione della forma; segnala le rotture prima che blocchino il lavoro.
- **intake-parser** — Fase 0: pre-controllo col contract-check, poi normalizza la richiesta (tipo, priorità, riferimenti, fast-path-eligibility).
- **spec-context** — Fase 1: prima di leggere il codice di un contesto, **legge il suo documento di
  architettura**; se è in drift, lo segnala. Carica il minimo sufficiente.
- **impl-runbook** — Fase 2: applica le **convenzioni dichiarate** in `flow.config.projectConventions`
  (non le inferisce); non tocca i file di test.
- **test-selector** — Fase 3: sceglie i test consultando il **test-playbook** (non inventa la strategia);
  su monorepo si appoggia al tool nativo (Turborepo/Nx `--affected`).

**Perché così.** Le due skill di servizio sono il modo in cui l'utente "parla" col kit senza maneggiare
file. Le skill di processo guadagnano un riferimento esplicito agli artefatti **dichiarati**:
`spec-context` legge gli architecture doc, `impl-runbook` le convenzioni, `test-selector` il test-playbook.
È sempre lo stesso principio: **dichiarare invece di inferire**.

---

## 5. Hook (eventi nativi) e sub-agent

Gli hook sono dichiarati in `hooks/hooks.json` e referenziano gli script via `${CLAUDE_PLUGIN_ROOT}`.
Scattano **solo nei progetti dove il plugin è abilitato**; in più ogni script fa **no-op se manca
`flow.config.json`** nel progetto (così il plugin è innocuo finché non è stato eseguito l'`install`).

`hooks/hooks.json`
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/preEditGuard.mjs\"" },
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/preWorkSnapshot.mjs\"" }
        ]
      }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/postWorkVerification.mjs\"" } ] }
    ]
  }
}
```

- **preEditGuard** (PreToolUse) — rende read-only i file di test (`flow.config.testPaths`) durante
  l'implementazione. Eccezione: marcatore `/tmp/aidevflow-testauthoring-<session>` posato dal test-author.
- **preWorkSnapshot** (PreToolUse) — alla prima modifica di codice produttore di dati
  (`flow.config.dataProducingPaths`), fa chiedere all'utente (con AskUserQuestion) se catturare lo
  snapshot "before". Marcatore di sessione; una modifica rilevante ri-arma il gate di verifica.
- **postWorkVerification** (Stop) — a fine turno, se ci sono modifiche non committate che ricadono nei
  `pathPatterns` del test-playbook, fa chiedere se eseguire la verifica. Guardia `stop_hook_active`.

Gli eventi di processo `on-spec-approved`, `post-implementation`, `on-tests-green` **non** hanno un
evento nativo corrispondente: restano **agent-driven** (l'agente li esegue al gate, come da PROCESS.md).

`agents/test-author.md` — **sub-agent isolato**: riceve SOLO la spec, deriva i test dal contratto,
posa il marcatore `test-authoring`, scrive e committa i test PRIMA del codice (l'ordine è provato dal
timestamp git), poi rimuove il marcatore. L'isolamento è strutturale e verificabile dalla git history.

**Perché così.** L'anti teaching-to-the-test non è "l'agente promette di non guardare il codice": è
strutturale (input = sola spec, ordine provato da git, hook che blocca le modifiche successive). Il
`preWorkSnapshot` aggiunge la gamba mancante per i test sui dati: senza uno stato "before" catturato a
codice pristino, un confronto pre/post è impossibile.

---

## 5-bis. Connettori (ticketing / helpdesk) — pronti e agnostici

L'interfaccia dei connettori è **agnostica e sostituibile**, ma il kit ne ship già due **pronti**,
perché in azienda si usano sempre questi: **Productive** (ticketing) e **Zammad** (helpdesk). L'install
**non chiede** quale tool usare (niente domande su Jira/Trello/ecc.): i default sono `productive` e
`zammad` in `flow.config.connectors`. Non si reimplementa nulla a ogni progetto.

- **Contratto** (`connectors/README.md`): un connettore è un comando
  `node "${CLAUDE_PLUGIN_ROOT}/connectors/<nome>.mjs" "<url-o-id>"` che stampa su stdout un JSON
  normalizzato (`connector`, `kind`, `id`, `number`, `title`, `description`, `references`, `customer`, `raw`).
- **`productive.mjs`** — ticketing, REST `api.productive.io/api/v2` (header `X-Auth-Token` +
  `X-Organization-Id`). Env: `PRODUCTIVE_API_TOKEN`. Estrae eventuali URL di helpdesk dai custom field.
- **`zammad.mjs`** — helpdesk, REST `<base>/api/v1/...`. Env: `ZAMMAD_API_TOKEN` e, se l'istanza è
  dietro Cloudflare Access, `ZAMMAD_CF_AUTHORIZATION` (cookie).
- **Sostituire/aggiungere**: crea `connectors/<nome>.mjs` che rispetta il contratto e imposta
  `flow.config.connectors.ticketing`/`.helpdesk` = `"<nome>"`. Skill e intake restano invariati.

**Perché così.** L'astrazione resta (sostituibile), ma i connettori concreti sono già pronti e uniformi:
nessuno spreco di token per "crearseli" a ogni install, nessuna implementazione divergente. Le
credenziali sono env-based (vedi `connectors/.env.example`), mai committate.

**Contract-check (Fase 2).** `connectors/check.mjs` (skill `connectors-check`) verifica che i connettori
configurati rispondano ancora come previsto, **prima** che blocchino il lavoro. Ogni connettore ha una
modalità `--check` (probe autenticato a un endpoint leggero: Productive `/people`, Zammad `/users/me`)
che riporta `ok | config-missing | auth-failed | drift | unreachable`. Il runner aggrega i risultati e,
se viene passato un campione, valida anche la **forma** dell'output contro `contract.schema.json`. Stati:
credenziali assenti = AVVISO (non un guasto); auth-failed/drift/contract-mismatch/missing-file = ROTTO
(exit 1). Lo eseguono il doctor (Passo 5) e l'intake-parser come pre-controllo.

---

## 5-ter. Telemetria (Fase 2) — OTEL nativo + stack OTLP/Grafana

I dati accurati di token/costo vengono **solo** dall'**OpenTelemetry nativo** di Claude Code: gli hook
non espongono token/costo/durata e il transcript li sottostima (~100×). Quindi niente DB o connettore
custom — il kit usa l'OTLP nativo verso uno **stack OTLP standard** con **Grafana**.

- **Cattura per-progetto**: l'install scrive nel `.claude/settings.json` del progetto un blocco `env`
  (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_*`, `OTEL_RESOURCE_ATTRIBUTES=project.name=<nome reale>`).
  Verificato: l'`env` di settings.json è **scoped al progetto** → la telemetria gira solo lì, mai nelle
  altre chat dell'utente (stesso vincolo di isolamento del resto del kit).
- **Non anonimo**: `project.name` (nome progetto reale) iniettato via resource attribute; l'attore arriva
  dagli attributi OTEL `user.email`/`user.id`. Solo metriche/metadati: nessun contenuto (il logging dei
  prompt resta spento).
- **Backend**: `telemetry/docker-compose.yml` con `grafana/otel-lgtm` (OTLP-in + Prometheus/Loki/Tempo +
  Grafana). L'endpoint è preconfigurato in `flow.config.telemetry.otlpEndpoint`. `enabled=false` disattiva.
- **Swappabilità**: l'OTLP **è** il layer agnostico — si cambia backend cambiando l'endpoint, senza
  riscrivere nulla (niente più "connettore di storage" custom). L'uninstall rimuove le variabili env.

**Perché così.** Il pivot rispetto all'idea iniziale (connettore Postgres + endpoint di ingestione
custom) nasce da due fatti verificati: i token accurati esistono solo via OTEL, e l'OTLP di Claude Code
è solo `http/protobuf`/`grpc` (un endpoint JSON custom sarebbe stato goffo). Uno stack OTLP standard è
più semplice, più robusto e già pronto per Grafana.

---

## 6. Template degli artefatti

`templates/`: `spec.md`, `plan.md`, `changelog.md`, `qa-log.md`, `architecture.md`, `test-playbook.md`,
`AGENT.md`, `CLAUDE.md`. I due nuovi rispetto alla prima stesura:

- **architecture.md** (per-contesto) — descrive il sistema com'è ORA: cosa fa il contesto, come si
  incastrano i pezzi, **invarianti**, dove si modifica in sicurezza, confini/dipendenze. Niente storia,
  niente "prima era", niente "attualmente". Si legge *prima* di toccare il codice; il drift va segnalato.
- **test-playbook.md** — versione leggibile di `flow.config.testPlaybook`: per ogni tipo di test,
  *quando si applica* e *con quale comando*. Catturato in intervista, non inferito.

`AGENT.md` (agnostico) porta in testa la **Regola del 98%** e le regole chiave; `CLAUDE.md` è il ponte
che lo richiama, dentro i marcatori `<!-- ai-dev-flow:start/end -->` (così aggiornamento e
disinstallazione toccano solo quella parte, preservando il contenuto preesistente del progetto).

---

## 7. `flow.config.json` per-progetto

È **il solo posto** delle personalizzazioni; l'aggiornamento del plugin non lo tocca, lo si modifica
con la skill `flow-settings`.

`project-files/flow.config.template.json`
```json
{
  "specStore": { "mode": "same-repo", "path": ".ai-dev/specs", "repoUrl": null },
  "changelog": { "path": ".ai-dev/changelog.md" },
  "architectureDocs": { "byContext": { "[nome-contesto]": { "path": "[contesto]/architecture.md" } } },
  "testPlaybook": {
    "[non-regression]": {
      "appliesWhen": "modifiche a sync/ETL, schema DB, query che scrivono su tabelle",
      "pathPatterns": ["**/sync/**", "**/*.sql", "database/**"],
      "command": "[comando per lanciarlo]",
      "needsBeforeSnapshot": true
    },
    "[end-to-end]": {
      "appliesWhen": "modifiche a UI / componenti / pagine",
      "pathPatterns": ["**/src/components/**", "**/src/app/**"],
      "command": "[comando per lanciarlo]",
      "needsBeforeSnapshot": false
    }
  },
  "projectConventions": { "rules": [], "sourceDoc": null },
  "maxRefine": { "warn": 3, "block": 6 },
  "fastPath": { "askEachTime": true, "autoUnderThreshold": false, "thresholdLines": 20 },
  "testPaths": ["**/*.test.*", "**/*.spec.*", "tests/**", "e2e/**"],
  "dataProducingPaths": [],
  "monorepo": { "tool": "auto", "affectedBase": "pre-task" },
  "tokenEconomy": { "ponytail": "lite", "headroom": false },
  "telemetry": { "enabled": true, "otlpEndpoint": "http://localhost:4318", "otlpProtocol": "http/protobuf", "serviceName": "ai-dev-flow", "projectName": null },
  "connectors": { "ticketing": "productive", "helpdesk": "zammad", "envFile": ".ai-dev/connectors.env", "instances": {} }
}
```

Sezioni popolate per intervista in install: `architectureDocs` (registro dei doc per-contesto),
`testPlaybook` (ricetta dei test, con `pathPatterns` machine-readable per il matching degli hook),
`projectConventions` (i "suggerimenti di progetto" che l'impl-runbook applica), `dataProducingPaths`
(arma il gate `preWorkSnapshot`). `connectors` default `null`: il ticketing si chiede, non si assume.

`project-files/flow.lock.template.json` — dichiara `kitVersion`/`processVersion` e l'`assessment`
(tipo new/existing, monorepo, **elenco dei contesti**, hash dei file-chiave). Se cambia la struttura
(es. nuova app), l'hash non combacia e l'assessment si rifà.

---

## 8. `bin/` — install / uninstall / migrate per-progetto

Funzionanti e testati. Sintesi di `install.mjs`:

- **Idempotente**: se `flow.lock.json` esiste con la stessa `kitVersion`, non rifà nulla (salvo `--force`).
- **Rileva i contesti** dai workspace (`pnpm-workspace.yaml` e `workspaces` di `package.json`, espandendo
  i glob `*/`).
- Crea `flow.config.json` (template + `--decisions`), `flow.lock.json` (con hash, contesti e **manifest**).
- **Abilita il plugin SOLO nel progetto**: scrive `enabledPlugins` + `extraKnownMarketplaces` nel
  `.claude/settings.json` (sorgente `github` dedotta dal remote del kit, o `directory` locale). Se
  `tokenEconomy.ponytail` ≠ `"off"`, abilita per-progetto anche il plugin **Ponytail**
  (`github DietrichGebert/ponytail`) per l'essenzialità del codice — non lo reimplementa.
- Crea `AGENT.md` (se assente) e inietta il blocco delimitato in `CLAUDE.md` preservando il preesistente.
- Crea un `architecture.md` per contesto acconsentito; inizializza il changelog.
- **Transazionale**: traccia file creati/modificati; a errore esegue il rollback completo.
- **Scrive un manifest** in `flow.lock.json` (`install`): file creati con `sha256` e flag `userContent`,
  file modificati (settings, blocco CLAUDE), cartelle create. È la base per una disinstallazione precisa.

Le **decisioni** dell'intervista arrivano via `--decisions <file.json>`
(`{ installedAt, config:{…override…}, architectureContexts:[…] }`); senza, usa i default del template
e lo segnala (non inferisce test né convenzioni).

`uninstall.mjs` legge quel manifest e **ripulisce in sicurezza**:

- disabilita il plugin nel progetto (rimuove `enabledPlugins` + `extraKnownMarketplaces`, lasciando
  intatte le altre impostazioni; cancella `settings.json` solo se creato da noi e rimasto vuoto);
- rimuove il blocco AI-Dev Flow da `CLAUDE.md` preservando il resto (cancella il file solo se creato
  da noi e rimasto vuoto);
- elimina i file creati dall'install; `flow.lock.json` per ultimo; rimuove le cartelle rimaste vuote;
- **preserva** i file che l'utente ha modificato dopo l'install (hash diverso da quello del manifest) —
  `flow.config.json`, `AGENT.md`, architecture, changelog — a meno di `--purge` (rimuove tutto).

`migrate.mjs` (Fase 2) porta gli artefatti per-progetto dalla `kitVersion` installata a quella corrente:
applica in ordine le migrazioni `migrations/<from>-to-<to>.mjs` (trasformazioni di formato), poi aggiorna
il lockfile. Le versioni senza cambi di formato sono semplici bump. Idempotente, transazionale (rollback),
no downgrade. Il drift è segnalato a inizio sessione dall'hook `versionDrift` (SessionStart). La migrazione
è **per-progetto**: "su tutti i progetti" avviene man mano che ciascuno viene aperto.

---

## Riepilogo della revisione

Il kit è implementato come **plugin Claude Code abilitabile per singolo progetto**. Copre:
installazione per-progetto **per intervista** (chiedi, non inferire), i 3 gate umani, la **regola del
98%**, la selezione test guidata dal **test-playbook dichiarato**, i **documenti di architettura
per-contesto**, le **convenzioni di progetto dichiarate**, il **gate di snapshot pre-work** per i dati,
l'isolamento strutturale dei test (sub-agent + hook), i **connettori pronti** (Productive/Zammad) con
interfaccia agnostica, le **cinque skill di servizio** (`install`, `uninstall`, `migrate`,
`flow-settings`, `connectors-check`) e una **disinstallazione pulita** basata su manifest.

Della **Fase 2** sono implementati: la **telemetria** (OTEL nativo per-progetto → stack OTLP/Grafana),
il **contract-check dei connettori** e la **migrazione automatica** per-progetto (con drift-notice a
inizio sessione). Restano per le fasi successive: telemetria → dashboard di analisi (Fase 3) e la
compressione del contesto/Headroom (Fase 4).

Le idee nascono dall'osservazione di un progetto reale gestito a mano, ma sono state **generalizzate**:
il plugin non eredita liste o procedure di quel progetto, eredita i *pattern*. Tutto ciò che è specifico
di un progetto vive nei suoi file di config e di architettura, popolati per intervista, non nel core del
plugin.

Repo (fonte di verità): `git@github-work:menea-DQ/AI-Dev-Flow.git`.
