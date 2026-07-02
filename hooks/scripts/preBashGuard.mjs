#!/usr/bin/env node
// Hook PreToolUse (Bash): chiude la porta laterale dell'anti teaching-to-the-test (GAP-04).
// I file di test sono read-only per l'implementatore anche via shell: blocca i comandi Bash che
// scrivono/modificano/rimuovono path che matchano flow.config.testPaths (redirection, sed -i, tee,
// mv/cp, rm, ...). Eccezione: marcatore "test-authoring" (sub-agent test-author).
//
// L'euristica è dichiaratamente best-effort: copre i vettori comuni. Il canale corretto per
// scrivere i test resta il sub-agent test-author.

import { existsSync } from 'node:fs';
import { readHookInput, isFlowProject, loadFlowConfig, toRelativePath, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';

const WRITE_INDICATOR_PATTERN = /(?:^|[\s;|&(])(?:>>?|tee(?:\s|$)|sed\s+(?:-[a-zA-Z]*\s+)*-i|perl\s+(?:-[a-zA-Z]*\s+)*-i|mv\s|cp\s|rm\s|truncate\s|dd\s|patch\s|>\s*)/;

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}
const command = input?.tool_input?.command;
if (!command || typeof command !== 'string') {
  process.exit(0);
}

const sessionId = input?.session_id;
if (existsSync(markerPath('testauthoring', sessionId))) {
  process.exit(0);
}

const config = loadFlowConfig();
const testPaths = config.testPaths ?? [];
if (testPaths.length === 0) {
  process.exit(0);
}

const hasWriteIndicator = WRITE_INDICATOR_PATTERN.test(command) || command.includes('>');
if (!hasWriteIndicator) {
  process.exit(0);
}

// Estrae i token che sembrano path e li confronta con i pattern dei file di test.
const candidateTokens = command
  .split(/[\s;|&()<>'"`]+/)
  .map((token) => token.trim())
  .filter((token) => token !== '' && !token.startsWith('-'))
  .map((token) => toRelativePath(token));

const touchedTestPaths = candidateTokens.filter((token) => matchesAnyPattern(token, testPaths));
if (touchedTestPaths.length === 0) {
  process.exit(0);
}

blockWithInstruction(
  `[AI-Dev Flow · pre-bash-guard] Questo comando Bash sembra scrivere/modificare file di test ` +
  `(${[...new Set(touchedTestPaths)].join(', ')}): i file di test sono read-only durante l'implementazione, ` +
  `anche via shell (anti teaching-to-the-test).\n` +
  `Se ritieni che un test sia sbagliato rispetto alla spec, NON modificarlo: segnalalo all'utente. ` +
  `La scrittura dei test spetta al sub-agent test-author isolato.\n` +
  `Se il comando NON tocca in scrittura quei file (falso positivo), riformulalo in modo che i path ` +
  `dei test non compaiano tra gli argomenti scritti.\n`,
);
