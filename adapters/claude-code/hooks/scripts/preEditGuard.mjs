#!/usr/bin/env node
// Hook PreToolUse: rende read-only i file di test durante l'implementazione.
// Eccezione: se è attivo il marcatore "test-authoring" (lo posa il sub-agent test-author),
// la scrittura dei test è autorizzata.

import { existsSync } from 'node:fs';
import { readHookInput, loadFlowConfig, toRelativePath, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';

const input = await readHookInput();
const editedFilePath = input?.tool_input?.file_path;
if (!editedFilePath) {
  process.exit(0);
}

const sessionId = input?.session_id;
if (existsSync(markerPath('testauthoring', sessionId))) {
  process.exit(0);
}

const config = loadFlowConfig();
const testPaths = config.testPaths ?? [];
const relativePath = toRelativePath(editedFilePath);

if (!matchesAnyPattern(relativePath, testPaths)) {
  process.exit(0);
}

blockWithInstruction(
  `[AI-Dev Flow · pre-edit-guard] "${relativePath}" è un file di test: read-only durante l'implementazione ` +
  `(anti teaching-to-the-test).\n` +
  `Se ritieni che un test sia sbagliato rispetto alla spec, NON modificarlo: segnalalo all'utente. ` +
  `La scrittura dei test spetta al sub-agent test-author isolato, che la deriva dalla sola specifica.\n`,
);
