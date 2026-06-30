#!/usr/bin/env node
// Hook SessionStart: se la versione del kit installata nel progetto (flow.lock.json.kitVersion) è
// più vecchia di quella del plugin (VERSION), emette un avviso non bloccante che suggerisce `migrate`.
// No-op nei progetti senza flow.lock.json (kit non installato) o senza drift.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const lockPath = join(projectDirectory, 'flow.lock.json');

if (!pluginRoot || !existsSync(lockPath)) {
  process.exit(0);
}

let installedVersion;
let currentVersion;
try {
  installedVersion = JSON.parse(readFileSync(lockPath, 'utf8')).kitVersion;
  currentVersion = readFileSync(join(pluginRoot, 'VERSION'), 'utf8').trim();
} catch {
  process.exit(0);
}

if (!installedVersion || !currentVersion || compareSemver(installedVersion, currentVersion) >= 0) {
  process.exit(0);
}

process.stdout.write(
  `[AI-Dev Flow] Questo progetto usa la versione ${installedVersion} del kit, ma è disponibile la ${currentVersion}. ` +
  `Suggerisci all'utente di eseguire la skill \`migrate\` per aggiornare gli artefatti per-progetto.\n`,
);
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
