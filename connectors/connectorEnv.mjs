// Carica le credenziali dei connettori da un file env del PROGETTO in process.env, prima che il
// connettore le legga. Il percorso è flow.config.connectors.envFile (default .ai-dev/connectors.env),
// risolto rispetto alla cwd (la radice del progetto). Le variabili già presenti nell'ambiente reale
// hanno la precedenza (non vengono sovrascritte).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadConnectorEnv() {
  const projectRoot = process.cwd();
  let envFileRelativePath = '.ai-dev/connectors.env';
  try {
    const config = JSON.parse(readFileSync(join(projectRoot, 'flow.config.json'), 'utf8'));
    if (config?.connectors?.envFile) {
      envFileRelativePath = config.connectors.envFile;
    }
  } catch {
    // nessun flow.config leggibile: uso il default
  }

  const envFilePath = join(projectRoot, envFileRelativePath);
  if (!existsSync(envFilePath)) {
    return;
  }

  for (const rawLine of readFileSync(envFilePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().replace(/^export\s+/, '');
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
