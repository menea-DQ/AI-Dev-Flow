// Utilities condivise dagli hook di AI-Dev Flow (plugin Claude Code).
// Nessuna dipendenza esterna: leggono lo stdin JSON di Claude Code e la flow.config.json del progetto.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { globToRegExp, matchesAnyPattern, readFlowConfig } from '../../lib/common.mjs';

// Il matcher glob vive in lib/common.mjs (lo usa anche bin/flowState.mjs): qui si ri-esporta,
// così i call site degli hook restano invariati e il comportamento è uno solo.
export { globToRegExp, matchesAnyPattern };

export function isFlowProject() {
  return existsSync(join(projectDirectory(), 'flow.config.json'));
}

const MARKER_DIRECTORY = '/tmp';

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function projectDirectory() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function loadFlowConfig() {
  return readFlowConfig(projectDirectory());
}

export function toRelativePath(absoluteOrRelativePath) {
  if (!absoluteOrRelativePath) {
    return '';
  }
  const root = projectDirectory();
  if (absoluteOrRelativePath.startsWith(`${root}/`)) {
    return absoluteOrRelativePath.slice(root.length + 1);
  }
  return absoluteOrRelativePath;
}

export function markerPath(kind, sessionId) {
  return join(MARKER_DIRECTORY, `aidevflow-${kind}-${sessionId || 'unknown'}`);
}

export function blockWithInstruction(instruction) {
  process.stderr.write(instruction);
  process.exit(2);
}
