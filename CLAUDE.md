# CLAUDE.md — guida per sviluppare il kit AI-Dev Flow

> Questo file serve a chi **lavora sul kit**, non al kit in sé. NON viene installato nei progetti
> utente (quello lo scaffolda `bin/install.mjs`) e non fa parte del runtime del plugin. Tienilo
> denso e aggiornato: viene caricato a ogni sessione.

## Cos'è questo repo

La radice è **insieme marketplace e plugin Claude Code** (`.claude-plugin/marketplace.json` con
`source: "./"` + `plugin.json`). Il kit standardizza un processo di sviluppo AI-assistito
human-in-the-loop, **abilitabile per singolo progetto** (mai globale). Entrypoint utente: skill `flow`.
Fonte di verità del processo: `PROCESS.md`. Manuale discorsivo: `docs/AI_Dev_Flow_Manuale.md`.

## Principio architetturale (da rispettare)

- **Core agnostico**: il *processo* (PROCESS.md) e gli *artefatti/template* (.md) sono indipendenti
  dal tool.
- **Strato adattatore Claude Code**: `skills/`, `hooks/`, `agents/`, e l'install che scrive in
  `.claude/` — questi SONO specifici di Claude Code. Non fingere agnosticismo dove non c'è.
- **Flusso garantito, non solo prescritto**: gli hook sono i *guardiani dei contratti di fase*; lo
  stato per-task (`.ai-dev/tasks/<id>/state.json`) è la memoria; il **sequencer** (`flowState.mjs
  next`) calcola il prossimo passo dai fatti registrati (l'LLM non decide la sequenza a memoria).

## Mappa del repo

- `bin/` — script CLI/libreria (ESM `.mjs`): `flowState.mjs` (stato per-task + sequencer `next` +
  `abort`), `install.mjs`, `uninstall.mjs`, `migrate.mjs`, `telemetry.mjs`.
- `hooks/` — `hooks.json` (aggancio a SessionStart/PreToolUse/Stop) + `scripts/*.mjs`. Utilità
  condivise degli hook in `hooks/scripts/hookShared.mjs`.
- `skills/<nome>/SKILL.md` — skill di processo (frontmatter YAML `name`/`description`).
- `agents/*.md` — sub-agent per fase, ciascuno col suo `model:` (il frontmatter è ciò che *garantisce*
  il tier: batte il modello di sessione, e l'orchestratore ha il divieto di passare `model` alla
  chiamata). Il tier del **thread principale** non sta qui: è un default per-progetto
  (`flow.config.models.mainThread` → `"model"` in `.claude/settings.json`, scritto dall'install).
- `output-styles/*.md` — output style consegnati dal plugin (economia dell'attenzione: output
  essenziale nel flusso, domande e gate completi). NON copiati nei progetti: l'install scrive solo
  la selezione (`outputStyle` in `.claude/settings.json`).
- `connectors/` — connettori (Productive/Zammad) + contratto (`contract.schema.json`) + `check.mjs`.
  Env condiviso in `connectors/connectorEnv.mjs`.
- `templates/` — modelli degli artefatti prodotti dal processo.
- `project-files/` — template di config per-progetto (`flow.config.template.json`).
- `migrations/` — migrazioni di formato per-progetto `<from>-to-<to>.mjs`.
- `lib/common.mjs` — **utilità pure condivise** tra `bin/` e `hooks/` (semver, regex-escape, OTEL env,
  matcher glob dei pattern di config, lettura di `flow.config.json`).
- `telemetry/` — stack OTLP + Grafana (opzionale, abilitabile via `flow.config.telemetry`).
- `docs/` — manuale + diagramma corrente (V5); `docs/archive/` = artefatti storici/di lavoro.

## Convenzioni quando modifichi il kit

- **Niente `package.json`, niente dipendenze**: solo Node ESM standard. Il codice condiviso pure va in
  `lib/common.mjs` (importato con path relativo); NON duplicare helper tra script.
- **Ogni template in `templates/` deve avere un consumatore reale** (install che lo copia, o un
  sub-agent/skill che lo referenzia via path, es. `spec-author` → `templates/spec.md`). Un template
  che nessuno legge è debito, non documentazione.
- **`flow.config.json` è l'unica fonte di verità operativa** per config per-progetto (es.
  `testPlaybook`): letta da hook e skill, editata da `flow-settings`. Non creare mirror `.md`.
  Tre eccezioni note, dove la config è solo l'INTENTO e ciò che *applica* è `.claude/settings.json`:
  `telemetry.*` (riallineato da `bin/telemetry.mjs --apply`), `models.mainThread` (chiave `"model"`)
  e `output.style` (chiave `"outputStyle"`) — le ultime due scritte da install e migrazione e
  riallineate a mano da `flow-settings`. Chi tocca quelle sezioni deve riallineare il settings nello
  stesso giro, o config e realtà divergono.
- **Bump di versione**: aggiorna insieme `VERSION`, `.claude-plugin/plugin.json`, l'header di
  `PROCESS.md` (`process-version` + `compatibile-con`) e l'header del Manuale.
- **Aggiorna SEMPRE le docs nello stesso giro** della modifica al kit (README, docs/, README di
  cartella pertinenti). Regola permanente richiesta dal maintainer.
- **Migrazioni**: i "gap" di versione (versioni senza cambio-formato) sono **intenzionali** —
  `migrate.mjs` li tratta come semplici bump. Aggiungi un file di migrazione solo se cambia davvero il
  formato di un artefatto per-progetto. È idempotente e transazionale (rollback a errore).
- **Insidie del manifest** (`.claude-plugin/`): NON dichiarare `hooks/hooks.json` nel campo `hooks`
  del `plugin.json` (doppio caricamento); nel `marketplace.json` la source deve iniziare con `./`.
- **Insidie degli output style** (verificate sul campo con CLI 2.1.153, non dedotte dai doc):
  un output style consegnato dal plugin si seleziona SOLO col nome **namespaced**
  `<prefisso>:<name del frontmatter>` — il nome nudo non viene trovato, e il `name` del frontmatter
  conta più del nome del file. Il prefisso è il nome del **plugin**, non del marketplace: provato
  installando il kit da un marketplace rinominato (`aidf-verify`) e verificando che
  `ai-dev-flow:AI-Dev Flow` carica lo stile. `claude plugin details` NON elenca gli output style nell'inventario dei componenti: è un
  buco della vista, non un mancato caricamento (verificalo interrogando la sessione, non l'inventario).
  L'alternativa `force-for-plugin: true` funziona senza scrivere nei settings ma SCAVALCA anche una
  scelta esplicita dell'utente: scartata di proposito. Per provarlo in locale serve una COPIA del kit
  con marketplace e plugin rinominati (`claude plugin marketplace add <path>` + `install --scope
  local`): con lo stesso nome collide col marketplace GitHub dell'utente e glielo sostituisce.

## Come testare una modifica (senza credenziali reali)

Usa un progetto scratch e simula il ciclo di vita:

```
node bin/install.mjs --project <scratch>     # scaffolding + abilitazione per-progetto
node bin/migrate.mjs --project <scratch>     # no-op se già aggiornato; falsa la kitVersion nel lock per esercitare le migrazioni
node bin/telemetry.mjs --project <scratch> --status
node bin/uninstall.mjs --project <scratch> --purge
```

Più `node --check <file>` sugli script toccati e `claude plugin validate .` sul manifest. Gli hook
si esercitano con `CLAUDE_PLUGIN_ROOT=<kit> CLAUDE_PROJECT_DIR=<scratch> node hooks/scripts/<hook>.mjs`.
Un OUTPUT STYLE non si verifica leggendo i file: si interroga la sessione, perché è l'unico modo di
sapere se è finito nel system prompt —
`claude -p "Nelle tue istruzioni compare <una frase letterale dello stile>? Rispondi SI o NO." < /dev/null`
dentro un progetto scratch con lo stile selezionato (`outputStyle` in `.claude/settings.json`).
Le scritture dei connettori (`--update-status`/`--comment`) NON sono validate sul campo: dichiaralo.
