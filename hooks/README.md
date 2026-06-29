# Hook del plugin AI-Dev Flow

Gli hook sono dichiarati in `hooks.json` e referenziano gli script in `scripts/` via `${CLAUDE_PLUGIN_ROOT}`.
Scattano **solo nei progetti dove il plugin è abilitato** (`enabledPlugins` nel `.claude/settings.json`
del progetto). In più, ogni script fa **no-op se manca `flow.config.json`** nel progetto: così il plugin
è innocuo finché non è stato eseguito l'`install` per quel progetto.

## Hook agganciati a eventi nativi di Claude Code

- **preEditGuard.mjs** — `PreToolUse` (Edit|Write|MultiEdit|NotebookEdit). Rende read-only i file di
  test durante l'implementazione (anti teaching-to-the-test). Eccezione: marcatore `test-authoring`
  posato dal sub-agent test-author.
- **preWorkSnapshot.mjs** — `PreToolUse`. Alla prima modifica di codice produttore di dati
  (`dataProducingPaths`), fa chiedere all'utente se catturare lo snapshot "before". Marcatore di sessione.
- **postWorkVerification.mjs** — `Stop`. A fine turno, se ci sono modifiche non committate che ricadono
  nei `pathPatterns` del test-playbook, fa chiedere se eseguire la verifica. Guardia `stop_hook_active`.

## Eventi di processo che restano agent-driven

`on-spec-approved`, `post-implementation`, `on-tests-green` (vedi PROCESS.md) NON hanno un evento
nativo di Claude Code a cui agganciarsi: li esegue l'agente al gate corrispondente, seguendo PROCESS.md.

## Marcatori di sessione (in /tmp)

- `aidevflow-prework-<session>` — snapshot "before" già gestito in questa sessione.
- `aidevflow-verify-<session>` — verifica post-work già gestita; ri-armato da una nuova modifica ai dati.
- `aidevflow-testauthoring-<session>` — il sub-agent test-author sta scrivendo i test (autorizza preEditGuard).
