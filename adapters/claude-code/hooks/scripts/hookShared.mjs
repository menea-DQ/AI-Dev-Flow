// Utilities condivise dagli hook di AI-Dev Flow (adapter Claude Code).
// Nessuna dipendenza esterna: leggono lo stdin JSON di Claude Code e la flow.config.json del progetto.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
  const configPath = join(projectDirectory(), 'flow.config.json');
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
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

export function globToRegExp(glob) {
  const regexSpecials = '.+^${}()|[]\\/';
  let body = '';
  let index = 0;
  while (index < glob.length) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        if (glob[index + 2] === '/') {
          body += '(?:.*/)?';
          index += 3;
        } else {
          body += '.*';
          index += 2;
        }
      } else {
        body += '[^/]*';
        index += 1;
      }
    } else if (character === '?') {
      body += '[^/]';
      index += 1;
    } else if (regexSpecials.includes(character)) {
      body += `\\${character}`;
      index += 1;
    } else {
      body += character;
      index += 1;
    }
  }
  return new RegExp(`^${body}$`);
}

export function matchesAnyPattern(relativePath, patterns) {
  if (!relativePath || !Array.isArray(patterns)) {
    return false;
  }
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}

export function markerPath(kind, sessionId) {
  return join(MARKER_DIRECTORY, `aidevflow-${kind}-${sessionId || 'unknown'}`);
}

export function blockWithInstruction(instruction) {
  process.stderr.write(instruction);
  process.exit(2);
}
