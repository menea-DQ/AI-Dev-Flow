#!/usr/bin/env node
// Hook PreToolUse + PostToolUse su AskUserQuestion: timestampa nello stato del task le FERMATE
// UMANE — quando una domanda viene posta (Pre) e quando la risposta arriva (Post). È l'altro
// estremo che mancava per decomporre gli intervalli del report in tempo macchina vs attesa umana:
// i marcatori del sequencer dicono quando un passo inizia, queste coppie dicono quanto, dentro il
// passo, si è aspettata una persona.
//
// È MISURA, non presidio: non blocca mai (exit 0 in ogni caso), e senza task attivo non fa nulla.

import { readHookInput, isFlowProject, projectDirectory } from './hookShared.mjs';
import { loadActiveState, saveTaskState, appendLog, QUESTION_ASKED_EVENT, QUESTION_ANSWERED_EVENT } from '../../bin/flowState.mjs';

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}
const projectRoot = projectDirectory();
const state = loadActiveState(projectRoot);
if (!state || state.phase === 'done' || state.phase === 'aborted') {
  process.exit(0);
}
try {
  appendLog(state, input?.hook_event_name === 'PostToolUse' ? QUESTION_ANSWERED_EVENT : QUESTION_ASKED_EVENT);
  saveTaskState(projectRoot, state);
} catch {
  // la misura non deve mai intralciare il flusso
}
process.exit(0);
