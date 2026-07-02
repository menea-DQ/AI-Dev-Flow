# Hook del plugin AI-Dev Flow

Gli hook sono dichiarati in `hooks.json` e referenziano gli script in `scripts/` via `${CLAUDE_PLUGIN_ROOT}`.
Scattano **solo nei progetti dove il plugin è abilitato** (`enabledPlugins` nel `.claude/settings.json`
del progetto). In più, ogni script fa **no-op se manca `flow.config.json`** nel progetto: così il plugin
è innocuo finché non è stato eseguito l'`install` per quel progetto.

Dalla 0.0.7 gli hook sono i **guardiani dei contratti di fase**: leggono lo **stato per-task**
(`.ai-dev/tasks/<id>/state.json`, gestito da `bin/flowState.mjs`) e bloccano ciò che non rispetta i
contratti. Ogni skip/deroga è registrato nello stato (auditabile), mai silenzioso.

## Hook agganciati a eventi nativi di Claude Code

- **versionDrift.mjs** — `SessionStart`. Avvisa (via `systemMessage`, VISIBILE all'utente) se la
  versione del kit installata è vecchia e se c'è un **task in corso** da riprendere (riprendibilità).
- **preEditGuard.mjs** — `PreToolUse` (Edit|Write|MultiEdit|NotebookEdit). Due guardie:
  (1) i file di test (`testPaths`) sono read-only durante l'implementazione (anti teaching-to-the-test;
  eccezione: marcatore `test-authoring` del sub-agent test-author);
  (2) con un task attivo, la scrittura di codice sorgente richiede: spec approvata (Gate 1), piano
  approvato (Gate 2), branch di lavoro creato e checkout NON sul branch base. Deroghe solo esplicite
  (`flowState.mjs record-override`).
- **preBashGuard.mjs** — `PreToolUse` (Bash). Chiude la porta laterale: blocca i comandi shell che
  scrivono/modificano file di test (`sed -i`, redirection, `tee`, `mv/cp/rm`, …). Euristica
  dichiaratamente best-effort sui vettori comuni.
- **perimeterGuard.mjs** — `PreToolUse` (Skill|mcp__*). Enforcement del perimetro: nei progetti col
  kit si usano SOLO le skill del kit, Ponytail e le whitelist esplicite di `flow.config.perimeter`.
  Ogni altro server MCP o skill è bloccato.
- **preWorkSnapshot.mjs** — `PreToolUse`. Alla prima modifica di codice produttore di dati
  (`dataProducingPaths`), fa chiedere all'utente se catturare lo snapshot "before". Con task attivo
  la decisione è registrata NELLO STATO (persistente tra sessioni); senza, marcatore di sessione.
- **postWorkVerification.mjs** — `Stop`. Il guardiano di fine turno: (1) se ci sono modifiche nei
  `pathPatterns` del test-playbook non coperte da una verifica registrata per ESATTAMENTE questo
  diff (hash), blocca finché i test non girano (o skip motivato) — se il codice cambia dopo la
  verifica, il gate si **ri-arma da solo**; (2) a implementazione conclusa, blocca la chiusura
  finché doc-review, changelog e aggiornamento ticket non risultano fatti o esplicitamente saltati.
  Guardia `stop_hook_active`.

## Cosa resta agent-driven (per costruzione, non per dimenticanza)

I passi **cognitivi** (redigere la spec, valutare l'impatto sulla doc, scegliere i contenuti del
changelog) li fanno gli agenti; i **gate** li decide l'umano. Gli hook garantiscono il *che* — che
questi passi avvengano e siano registrati — non il *come*. Le operazioni meccaniche di fine fase
(update del ticket via connettore) hanno comandi deterministici (`--update-status`, `--comment`)
prescritti dai blocchi degli hook.

## Stato e marcatori

- **`.ai-dev/tasks/<id>/state.json`** — lo stato per-task (fase, gate, branch, snapshot, verifiche,
  doc-review, changelog, ticket, deroghe + log). Persistente e committabile: rende il task
  riprendibile e passabile tra colleghi. Unico punto di accesso: `bin/flowState.mjs`.
- Marcatori di sessione in `/tmp` (fallback senza task attivo / anti-nag intra-sessione):
  `aidevflow-prework-<session>`, `aidevflow-verify-<session>` (contiene l'hash del diff verificato),
  `aidevflow-testauthoring-<session>` (autorizza il test-author a scrivere i test).
