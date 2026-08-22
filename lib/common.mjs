// AI-Dev Flow — utilità pure condivise tra gli script del kit (bin/ e hooks/).
// Nessuna dipendenza esterna, nessuno stato: solo funzioni riusabili, così una correzione
// vive in un posto solo (regola d'oro: se è meccanico, è codice — e non duplicato).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Scompone una stringa semver "x.y.z" in [x, y, z] numerici. */
export function parseSemver(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

/** Confronta due semver: -1 se left < right, 1 se left > right, 0 se uguali. */
export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) < (b[index] ?? 0) ? -1 : 1;
    }
  }
  return 0;
}

/** Esegue l'escape dei metacaratteri di una regex, per usare `text` come letterale. */
export function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Le variabili d'ambiente OTEL che attivano la telemetria di Claude Code per un progetto.
 * Sorgente di intento: flow.config.telemetry. Usato sia dall'install sia dal riallineamento.
 */
export function telemetryEnvPairs(telemetry, projectName) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: telemetry.otlpProtocol ?? 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: telemetry.otlpEndpoint,
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'cumulative',
    OTEL_SERVICE_NAME: telemetry.serviceName ?? 'ai-dev-flow',
    OTEL_RESOURCE_ATTRIBUTES: `project.name=${projectName}`,
    OTEL_METRIC_EXPORT_INTERVAL: '10000',
  };
}

/**
 * Compila un glob (`*`, `**`, `?`) nella regex equivalente, ancorata.
 * Vive qui perché lo usano sia gli hook (pattern di flow.config) sia lo stato per-task
 * (esclusioni del manifest): un solo matcher, un solo comportamento.
 */
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

/** Vero se `relativePath` combacia con almeno uno dei glob in `patterns`. */
export function matchesAnyPattern(relativePath, patterns) {
  if (!relativePath || !Array.isArray(patterns)) {
    return false;
  }
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}

/**
 * Legge la flow.config.json di un progetto (unica fonte di verità operativa per-progetto).
 * Restituisce {} se assente o illeggibile: i chiamanti degradano sui default, non esplodono.
 */
export function readFlowConfig(projectRoot) {
  const configPath = join(projectRoot, 'flow.config.json');
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}
