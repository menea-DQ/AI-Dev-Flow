#!/usr/bin/env node
// Hook PreToolUse: alla PRIMA modifica (nella sessione) di codice produttore di dati,
// chiede all'utente se catturare lo snapshot "before" mentre il codice è ancora pristino.
// Una modifica rilevante ri-arma anche il gate di verifica post-work.

import { existsSync, rmSync } from 'node:fs';
import { readHookInput, isFlowProject, loadFlowConfig, toRelativePath, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';

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

if (isDataProducing) {
  rmSync(markerPath('verify', sessionId), { force: true });
}

const snapshotMarker = markerPath('prework', sessionId);
if (existsSync(snapshotMarker)) {
  process.exit(0);
}
if (!isDataProducing) {
  process.exit(0);
}

const snapshotTests = Object.entries(config.testPlaybook ?? {})
  .filter(([, entry]) => entry?.needsBeforeSnapshot)
  .map(([name, entry]) => `  - ${name}: ${entry.command ?? '[comando non configurato]'}`)
  .join('\n');

blockWithInstruction(
  `[AI-Dev Flow · pre-work-snapshot] Stai per modificare codice produttore di dati: "${relativePath}".\n` +
  `La prova di non-regressione richiede un confronto pre/post: lo stato "before" va catturato ORA, ` +
  `mentre il codice è ancora pristino.\n\n` +
  `DEVI chiedere all'utente con AskUserQuestion (in italiano) se:\n` +
  `  • catturare ORA lo snapshot "before" (consigliato), oppure\n` +
  `  • saltarlo e gestire la non-regressione a mano più tardi.\n\n` +
  (snapshotTests ? `Test che richiedono lo snapshot "before" (dal test-playbook):\n${snapshotTests}\n\n` : '') +
  `Qualunque sia la scelta, DOPO esegui:\n      touch ${snapshotMarker}\n` +
  `e poi procedi con la modifica. Il marcatore evita che questo gate ti riblocchi nelle ` +
  `modifiche successive di questa sessione.\n`,
);
