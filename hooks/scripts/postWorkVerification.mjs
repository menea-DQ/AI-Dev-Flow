#!/usr/bin/env node
// Hook Stop: il guardiano di fine turno. Due compiti:
//
// 1) VERIFICA (Fase 3): se ci sono modifiche che ricadono nel test-playbook e lo stato del task non
//    registra una verifica per ESATTAMENTE questo diff (hash), blocca finché i test non sono
//    eseguiti (o l'utente non salta, con motivazione registrata). Se il codice cambia dopo una
//    verifica, l'hash cambia e il gate si RI-ARMA da solo (GAP-05).
//
// 2) CHECKLIST DI CHIUSURA (GAP-01): a implementazione conclusa (verifica registrata), il turno non
//    si chiude finché doc-review, changelog e aggiornamento ticket non risultano fatti o
//    esplicitamente saltati (registrati nello stato, auditabili).
//
// Senza task attivo: fallback sul marcatore di sessione, con l'hash del diff nel contenuto del
// marcatore (così anche fuori flusso il gate si ri-arma se il codice cambia dopo la verifica).

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readHookInput, isFlowProject, loadFlowConfig, projectDirectory, matchesAnyPattern, markerPath, blockWithInstruction } from './hookShared.mjs';
import { loadActiveState, currentDiffHash, hasOverride } from '../../bin/flowState.mjs';

const FLOW_STATE_CLI = 'node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs"';

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}
if (input?.stop_hook_active === true) {
  process.exit(0);
}

const projectRoot = projectDirectory();
const sessionId = input?.session_id;

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

const config = loadFlowConfig();
const applicableTests = Object.entries(config.testPlaybook ?? {})
  .filter(([, entry]) => changedPaths.some((path) => matchesAnyPattern(path, entry?.pathPatterns ?? [])))
  .map(([name, entry]) => `  - ${name}: ${entry.command ?? '[comando non configurato]'}`);

const state = loadActiveState(projectRoot);

if (state && state.phase !== 'done' && state.phase !== 'aborted') {
  const diffHash = currentDiffHash(projectRoot);
  // Una verifica ROSSA non è una verifica soddisfatta: il gate resta armato finché i test non
  // passano (o l'utente non salta, motivando). Guardare solo l'hash del diff lascerebbe chiudere
  // il turno con i test rossi purché il rosso sia stato registrato.
  const redForThisDiff = state.verification?.status === 'failed' && state.verification.diffHash === diffHash;
  const verifiedForThisDiff = Boolean(state.verification) && state.verification.diffHash === diffHash && !redForThisDiff;

  // ————— 1) Verifica dal test-playbook —————
  if (applicableTests.length > 0 && !verifiedForThisDiff) {
    const reArmed = state.verification && state.verification.diffHash !== diffHash;
    blockWithInstruction(
      `[AI-Dev Flow · post-work verification] Task "${state.task.id}": ${redForThisDiff ? 'i test sono ROSSI sul codice attuale' : 'modifiche in aree coperte dal test-playbook'}` +
      `${reArmed ? ' e il codice è CAMBIATO dopo l\'ultima verifica (il gate si è ri-armato)' : ''}.\n\n` +
      `Test pertinenti:\n${applicableTests.join('\n')}\n\n` +
      (redForThisDiff
        ? `I ROSSI SI RISOLVONO NEL CODICE: i file di test sono read-only per te. Se ritieni che un test\n` +
          `sia sbagliato rispetto alla spec, NON adattarlo: segnalalo all'utente.\n` +
          `Quando i test passano: ${FLOW_STATE_CLI} record-verification --status done --tests "<nomi>"\n` +
          `Se l'utente sceglie di chiudere comunque: ${FLOW_STATE_CLI} record-verification --status skipped --reason "<motivo>"\n` +
          `  (chiediglielo con AskUserQuestion, in italiano chiaro e con il contesto dentro la domanda — è una sua scelta e resta registrata).\n\n`
        : `SE hai completato TUTTO il lavoro richiesto:\n` +
          `  • esegui i comandi qui sopra (per la non-regressione, diff strutturale contro lo snapshot "before");\n` +
          `  • poi registra: ${FLOW_STATE_CLI} record-verification --status done --tests "<nomi>"\n` +
          `  • se i test sono rossi: ${FLOW_STATE_CLI} record-verification --status failed --tests "<nomi>" e torna a correggere il CODICE;\n` +
          `  • se invece l'utente sceglie di saltare: ${FLOW_STATE_CLI} record-verification --status skipped --reason "<motivo>"\n` +
          `    (chiediglielo con AskUserQuestion, in italiano chiaro e con il contesto dentro la domanda — lo skip è una scelta umana e resta registrato).\n\n`) +
      `SE NON hai ancora finito il task: continua a lavorare, questo controllo tornerà a fine turno.\n`,
    );
  }

  // ————— 2) Checklist di chiusura —————
  const implementationEnded = Boolean(state.verification) || Boolean(state.gates?.diff);
  if (implementationEnded && !hasOverride(state, 'closure')) {
    const missing = [];
    if (!state.docReview) {
      missing.push(`doc-review non registrata — valuta l'impatto sulla documentazione (registro in flow.config.documentation.docs, sub-agent doc-author) e registra: ${FLOW_STATE_CLI} record-doc-review --status done|none-impacted|skipped …`);
    }
    if (!state.changelog) {
      missing.push(`changelog non aggiornato — scrivi la voce (scelta fatta e perché) e registra: ${FLOW_STATE_CLI} record-changelog`);
    }
    if (state.task?.connector && (state.ticketUpdates ?? []).length === 0) {
      missing.push(`ticket non aggiornato — aggiorna lo stato via connettore: node "\${CLAUDE_PLUGIN_ROOT}/connectors/${state.task.connector}.mjs" --update-status "${state.task.reference ?? state.task.id}" "<stato>" e registra: ${FLOW_STATE_CLI} record-ticket-update --status "<stato>"`);
    }
    if (missing.length > 0) {
      blockWithInstruction(
        `[AI-Dev Flow · chiusura] Task "${state.task.id}": l'implementazione risulta conclusa ma la chiusura è incompleta.\n\n` +
        `Passi mancanti (Fasi 4-5):\n${missing.map((line) => `  • ${line}`).join('\n')}\n\n` +
        `Completa i passi (o falli saltare ESPLICITAMENTE all'utente: gli skip restano registrati).\n` +
        `Se l'utente vuole rimandare tutta la chiusura: ${FLOW_STATE_CLI} record-override --gate closure --reason "<motivo>"\n`,
      );
    }
  }
  process.exit(0);
}

// ————— Fallback senza task attivo (marcatore con hash del diff) —————
if (changedPaths.length === 0 || applicableTests.length === 0) {
  process.exit(0);
}
const verifyMarker = markerPath('verify', sessionId);
const diffHash = currentDiffHash(projectRoot) ?? 'no-git';
if (existsSync(verifyMarker) && readFileSync(verifyMarker, 'utf8').trim() === diffHash) {
  process.exit(0);
}

blockWithInstruction(
  `[AI-Dev Flow · post-work verification] Hai terminato un turno con modifiche che ricadono in aree ` +
  `coperte dal test-playbook.\n\n` +
  `Test pertinenti da eseguire:\n${applicableTests.join('\n')}\n\n` +
  `SE hai completato TUTTO il lavoro richiesto:\n` +
  `  • DEVI chiedere all'utente con AskUserQuestion (in italiano chiaro, contesto DENTRO la domanda: quali test e cosa comporta saltarli) se eseguire ORA la verifica o saltarla.\n` +
  `  • Se esegue: lancia i comandi del test-playbook qui sopra; per la non-regressione, fai il diff ` +
  `strutturale contro lo snapshot "before".\n` +
  `  • Quando hai eseguito la verifica O l'utente ha scelto di saltarla, esegui:\n      printf '%s' "${diffHash}" > ${verifyMarker}\n` +
  `    (se il codice cambia ancora, questo controllo si ri-arma da solo).\n\n` +
  `SE NON hai ancora finito: continua il task. Questo blocco non si ripresenta nello stesso ciclo di continuazione.\n`,
);
