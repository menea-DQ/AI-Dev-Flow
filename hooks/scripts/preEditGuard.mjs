#!/usr/bin/env node
// Hook PreToolUse (Edit/Write/MultiEdit/NotebookEdit) — due guardie:
//
// 1) FILE DI TEST read-only durante l'implementazione (anti teaching-to-the-test).
//    Eccezione: marcatore "test-authoring" (lo posa il sub-agent test-author).
//
// 2) GATE DI FASE (GAP-01): se c'è un task AI-Dev Flow attivo (.ai-dev/tasks/ACTIVE), la scrittura
//    di codice sorgente è consentita solo se lo stato del task registra: spec approvata (Gate 1),
//    piano approvato (Gate 2) e branch di lavoro creato (mai sul branch base). Deroghe umane
//    esplicite via `flowState.mjs record-override` (auditabili). Senza task attivo, questa guardia
//    non si applica (il kit non ostacola il lavoro fuori flusso).

import { existsSync } from 'node:fs';
import { readHookInput, isFlowProject, loadFlowConfig, projectDirectory, toRelativePath, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';
import { loadActiveState, hasOverride, currentGitBranch } from '../../bin/flowState.mjs';

// Path esenti dal gate di fase: artefatti del flusso, config, documentazione.
const PHASE_GATE_EXEMPT_PATTERNS = [
  '.ai-dev/**',
  '**/*.md',
  '.claude/**',
  '.envrc',
  '.gitignore',
  '**/.gitignore',
  'flow.config.json',
  'flow.lock.json',
];

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}
const editedFilePath = input?.tool_input?.file_path;
if (!editedFilePath) {
  process.exit(0);
}

const sessionId = input?.session_id;
if (existsSync(markerPath('testauthoring', sessionId))) {
  process.exit(0);
}

const config = loadFlowConfig();
const relativePath = toRelativePath(editedFilePath);

// ————— Guardia 1: file di test read-only —————
if (matchesAnyPattern(relativePath, config.testPaths ?? [])) {
  blockWithInstruction(
    `[AI-Dev Flow · pre-edit-guard] "${relativePath}" è un file di test: read-only durante l'implementazione ` +
    `(anti teaching-to-the-test).\n` +
    `Se ritieni che un test sia sbagliato rispetto alla spec, NON modificarlo: segnalalo all'utente. ` +
    `La scrittura dei test spetta al sub-agent test-author isolato, che la deriva dalla sola specifica.\n`,
  );
}

// ————— Guardia 2: gate di fase sul codice sorgente (solo con task attivo) —————
const projectRoot = projectDirectory();
const state = loadActiveState(projectRoot);
if (!state || state.phase === 'done') {
  process.exit(0);
}
if (matchesAnyPattern(relativePath, PHASE_GATE_EXEMPT_PATTERNS)) {
  process.exit(0);
}

const flowStateCli = 'node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs"';
const missing = [];
if (!state.gates?.spec) {
  missing.push('specifica NON approvata (Gate 1) — a spec approvata dall\'utente registra: ' + `${flowStateCli} approve-gate spec`);
}
if (!state.gates?.plan) {
  missing.push('piano NON approvato (Gate 2) — a piano approvato dall\'utente registra: ' + `${flowStateCli} approve-gate plan`);
}
if (!state.branch?.name) {
  missing.push('branch di lavoro NON creato — crea il branch (chiedi base e nome all\'utente) e registra: ' + `${flowStateCli} set-branch --name <branch> --base <base>`);
}

if (missing.length > 0 && !hasOverride(state, 'implementation-gates')) {
  blockWithInstruction(
    `[AI-Dev Flow · pre-edit-guard] Task attivo "${state.task.id}": non puoi ancora scrivere codice sorgente ("${relativePath}").\n` +
    `Contratti di fase mancanti:\n${missing.map((line) => `  • ${line}`).join('\n')}\n\n` +
    `Completa i passi mancanti (con l'approvazione dell'utente ai gate). In alternativa, SOLO se l'utente lo autorizza\n` +
    `esplicitamente, registra la deroga auditabile: ${flowStateCli} record-override --gate implementation-gates --reason "<motivo>"\n`,
  );
}

if (state.branch?.name && state.branch?.base && !hasOverride(state, 'base-branch')) {
  const currentBranch = currentGitBranch(projectRoot);
  if (currentBranch && currentBranch === state.branch.base) {
    blockWithInstruction(
      `[AI-Dev Flow · pre-edit-guard] Sei sul branch base "${currentBranch}": lo sviluppo avviene sul branch di lavoro ` +
      `"${state.branch.name}".\n` +
      `Esegui: git checkout ${state.branch.name}\n` +
      `Deroga (solo con autorizzazione esplicita dell'utente): ${flowStateCli} record-override --gate base-branch --reason "<motivo>"\n`,
    );
  }
}

process.exit(0);
