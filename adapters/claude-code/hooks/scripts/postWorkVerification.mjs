#!/usr/bin/env node
// Hook Stop: a fine turno, se ci sono modifiche non committate che ricadono in aree coperte
// dal test-playbook, chiede all'utente se eseguire ORA la verifica pertinente.

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readHookInput, loadFlowConfig, projectDirectory, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';

const input = await readHookInput();
if (input?.stop_hook_active === true) {
  process.exit(0);
}

const sessionId = input?.session_id;
const verifyMarker = markerPath('verify', sessionId);
if (existsSync(verifyMarker)) {
  process.exit(0);
}

const projectRoot = projectDirectory();
let changedPaths = [];
try {
  const statusOutput = execSync('git status --porcelain --untracked-files=all', { cwd: projectRoot, encoding: 'utf8' });
  changedPaths = statusOutput
    .split('\n')
    .map((line) => line.slice(3).trim())
    .map((path) => (path.includes(' -> ') ? path.split(' -> ').pop() : path))
    .map((path) => path.replace(/^"|"$/g, ''))
    .filter(Boolean);
} catch {
  process.exit(0);
}
if (changedPaths.length === 0) {
  process.exit(0);
}

const config = loadFlowConfig();
const applicableTests = Object.entries(config.testPlaybook ?? {})
  .filter(([, entry]) => changedPaths.some((path) => matchesAnyPattern(path, entry?.pathPatterns ?? [])))
  .map(([name, entry]) => `  - ${name}: ${entry.command ?? '[comando non configurato]'}`);

if (applicableTests.length === 0) {
  process.exit(0);
}

blockWithInstruction(
  `[AI-Dev Flow · post-work verification] Hai terminato un turno con modifiche che ricadono in aree ` +
  `coperte dal test-playbook.\n\n` +
  `Test pertinenti da eseguire:\n${applicableTests.join('\n')}\n\n` +
  `SE hai completato TUTTO il lavoro richiesto:\n` +
  `  • DEVI chiedere all'utente con AskUserQuestion (in italiano) se eseguire ORA la verifica o saltarla.\n` +
  `  • Se esegue: lancia i comandi del test-playbook qui sopra; per la non-regressione, fai il diff ` +
  `strutturale contro lo snapshot "before".\n` +
  `  • Quando hai eseguito la verifica O l'utente ha scelto di saltarla, esegui:\n      touch ${verifyMarker}\n\n` +
  `SE NON hai ancora finito: continua il task. Questo blocco non si ripresenta nello stesso ciclo di continuazione.\n`,
);
