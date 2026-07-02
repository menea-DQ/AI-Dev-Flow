#!/usr/bin/env node
// Hook PreToolUse: alla PRIMA modifica di codice produttore di dati, chiede all'utente se catturare
// lo snapshot "before" mentre il codice è ancora pristino.
//
// Con un task attivo (.ai-dev/tasks/ACTIVE) la decisione è registrata NELLO STATO del task
// (persistente, auditabile, scope per-task: sopravvive a sessioni e riavvii — GAP-05).
// Senza task attivo, fallback sul marcatore di sessione in /tmp (comportamento storico).

import { existsSync, rmSync } from 'node:fs';
import { readHookInput, isFlowProject, loadFlowConfig, projectDirectory, toRelativePath, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';
import { loadActiveState } from '../../bin/flowState.mjs';

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}
const editedFilePath = input?.tool_input?.file_path;
if (!editedFilePath) {
  process.exit(0);
}

const sessionId = input?.session_id;
const config = loadFlowConfig();
const dataProducingPaths = config.dataProducingPaths ?? [];
const relativePath = toRelativePath(editedFilePath);
const isDataProducing = matchesAnyPattern(relativePath, dataProducingPaths);

if (!isDataProducing) {
  process.exit(0);
}

const snapshotTests = Object.entries(config.testPlaybook ?? {})
  .filter(([, entry]) => entry?.needsBeforeSnapshot)
  .map(([name, entry]) => `  - ${name}: ${entry.command ?? '[comando non configurato]'}`)
  .join('\n');

const projectRoot = projectDirectory();
const state = loadActiveState(projectRoot);

if (state) {
  if (state.snapshot) {
    process.exit(0); // decisione già presa e registrata per questo task
  }
  blockWithInstruction(
    `[AI-Dev Flow · pre-work-snapshot] Stai per modificare codice produttore di dati: "${relativePath}".\n` +
    `La prova di non-regressione richiede un confronto pre/post: lo stato "before" va catturato ORA, ` +
    `mentre il codice è ancora pristino.\n\n` +
    `DEVI chiedere all'utente con AskUserQuestion (in italiano) se:\n` +
    `  • catturare ORA lo snapshot "before" (consigliato), oppure\n` +
    `  • saltarlo (scelta sua, con motivazione).\n\n` +
    (snapshotTests ? `Test che richiedono lo snapshot "before" (dal test-playbook):\n${snapshotTests}\n\n` : '') +
    `Poi registra la decisione nello stato del task (auditabile) e riprova la modifica:\n` +
    `  • catturato:  node "\${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" record-snapshot --status captured\n` +
    `  • saltato:    node "\${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" record-snapshot --status skipped --reason "<motivo dell'utente>"\n`,
  );
}

// ————— Fallback senza task attivo: marcatore di sessione (storico) —————
rmSync(markerPath('verify', sessionId), { force: true }); // ri-arma la verifica post-work
const snapshotMarker = markerPath('prework', sessionId);
if (existsSync(snapshotMarker)) {
  process.exit(0);
}
blockWithInstruction(
  `[AI-Dev Flow · pre-work-snapshot] Stai per modificare codice produttore di dati: "${relativePath}".\n` +
  `La prova di non-regressione richiede un confronto pre/post: lo stato "before" va catturato ORA, ` +
  `mentre il codice è ancora pristino.\n\n` +
  `DEVI chiedere all'utente con AskUserQuestion (in italiano) se catturare ORA lo snapshot "before" o saltarlo.\n` +
  (snapshotTests ? `Test che richiedono lo snapshot "before" (dal test-playbook):\n${snapshotTests}\n\n` : '') +
  `Qualunque sia la scelta, DOPO esegui:\n      touch ${snapshotMarker}\n` +
  `e poi procedi con la modifica. (Suggerimento: se stai lavorando un ticket, avvia lo stato del task con\n` +
  `node "\${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" start --task <id> — le decisioni diventano persistenti e auditabili.)\n`,
);
