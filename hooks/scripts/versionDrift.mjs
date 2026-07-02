#!/usr/bin/env node
// Hook SessionStart: due avvisi, entrambi VISIBILI ALL'UTENTE via systemMessage (GAP-09 — lo
// stdout puro finiva solo nel contesto dell'agente, e il relay era discrezionale):
//   1) drift di versione: la versione del kit installata nel progetto è più vecchia del plugin;
//   2) task in corso: c'è un task AI-Dev Flow attivo (stato persistito) da riprendere.
// No-op nei progetti senza flow.lock.json (kit non installato).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const lockPath = join(projectDirectory, 'flow.lock.json');

if (!pluginRoot || !existsSync(lockPath)) {
  process.exit(0);
}

const userMessages = [];
const agentContext = [];

// ————— 1) Drift di versione —————
try {
  const installedVersion = JSON.parse(readFileSync(lockPath, 'utf8')).kitVersion;
  const currentVersion = readFileSync(join(pluginRoot, 'VERSION'), 'utf8').trim();
  if (installedVersion && currentVersion && compareSemver(installedVersion, currentVersion) < 0) {
    userMessages.push(`[AI-Dev Flow] Questo progetto usa la versione ${installedVersion} del kit ma è disponibile la ${currentVersion}: esegui la skill \`migrate\` per aggiornare gli artefatti.`);
    agentContext.push(`Il progetto è alla versione ${installedVersion} di AI-Dev Flow, il kit alla ${currentVersion}: proponi all'utente di eseguire la skill migrate.`);
  }
} catch {
  // lock non leggibile: nessun avviso di drift
}

// ————— 2) Task in corso (riprendibilità) —————
try {
  const activePointer = join(projectDirectory, '.ai-dev', 'tasks', 'ACTIVE');
  if (existsSync(activePointer)) {
    const taskId = readFileSync(activePointer, 'utf8').trim();
    const statePath = join(projectDirectory, '.ai-dev', 'tasks', taskId, 'state.json');
    if (taskId && existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      userMessages.push(`[AI-Dev Flow] Task in corso: "${taskId}" (fase: ${state.phase}). Il lavoro riprende da dov'era.`);
      agentContext.push(
        `C'è un task AI-Dev Flow attivo: "${taskId}", fase "${state.phase}". ` +
        `Leggi lo stato con: node "\${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" show — e riprendi il flusso da lì (skill flow).`,
      );
    }
  }
} catch {
  // stato non leggibile: nessun avviso di ripresa
}

if (userMessages.length === 0) {
  process.exit(0);
}

process.stdout.write(`${JSON.stringify({
  continue: true,
  systemMessage: userMessages.join('\n'),
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: agentContext.join('\n'),
  },
})}\n`);
process.exit(0);

function compareSemver(left, right) {
  const a = left.split('.').map((part) => Number.parseInt(part, 10));
  const b = right.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) < (b[index] ?? 0) ? -1 : 1;
    }
  }
  return 0;
}
