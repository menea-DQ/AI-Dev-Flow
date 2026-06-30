// Migrazione 0.0.3 → 0.0.4
// (1) Aggiunge OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative (richiesto da Prometheus/
//     otel-lgtm: senza temporality cumulativa le metriche non vengono accettate).
// (2) Rimette TUTTE le variabili OTEL (inclusa la nuova) ANCHE in .claude/settings.json, oltre al .envrc.
// Idempotente: aggiorna il blocco del .envrc e le chiavi in settings.json.

import { basename } from 'node:path';

const ENVRC_BLOCK_START = '# >>> ai-dev-flow telemetry >>>';
const ENVRC_BLOCK_END = '# <<< ai-dev-flow telemetry <<<';

function telemetryEnvPairs(telemetry, projectName) {
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

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  const telemetry = config?.telemetry;
  if (!telemetry?.enabled) {
    context.log('telemetria disabilitata: niente da fare.');
    return;
  }
  const projectName = telemetry.projectName || basename(context.projectRoot);
  const pairs = telemetryEnvPairs(telemetry, projectName);

  const settings = (await context.readJson('.claude/settings.json')) ?? {};
  settings.env ??= {};
  for (const [key, value] of Object.entries(pairs)) {
    settings.env[key] = value;
  }
  await context.writeJson('.claude/settings.json', settings);
  context.log('rimesse tutte le variabili OTEL (inclusa temporality) in settings.json');

  const exportsBlock = [ENVRC_BLOCK_START, ...Object.entries(pairs).map(([key, value]) => `export ${key}=${value}`), ENVRC_BLOCK_END].join('\n');
  const existing = (await context.readText('.envrc')) ?? '';
  let next;
  if (existing.includes(ENVRC_BLOCK_START)) {
    const blockPattern = new RegExp(`${escapeForRegExp(ENVRC_BLOCK_START)}[\\s\\S]*?${escapeForRegExp(ENVRC_BLOCK_END)}`);
    next = existing.replace(blockPattern, exportsBlock);
  } else {
    next = existing.trim() === '' ? `${exportsBlock}\n` : `${existing.replace(/\n*$/, '')}\n\n${exportsBlock}\n`;
  }
  await context.writeText('.envrc', next);
  context.log('aggiornato il blocco telemetria nel .envrc (aggiunta temporality)');
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
