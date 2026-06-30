// Migrazione 0.0.2 → 0.0.3
// La telemetria NON si abilita dall'env di .claude/settings.json (è una config di startup di
// Claude Code, ignorata da lì). Si passa a un .envrc (direnv): ambiente reale al lancio, per-progetto.
// Questa migrazione: (1) rimuove le env OTEL non funzionanti da settings.json; (2) scrive il blocco
// telemetria nel .envrc. Idempotente.

import { basename } from 'node:path';

const ENVRC_BLOCK_START = '# >>> ai-dev-flow telemetry >>>';
const ENVRC_BLOCK_END = '# <<< ai-dev-flow telemetry <<<';
const TELEMETRY_ENV_KEYS = ['CLAUDE_CODE_ENABLE_TELEMETRY', 'OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_SERVICE_NAME', 'OTEL_RESOURCE_ATTRIBUTES'];

export default async function up(context) {
  const settings = await context.readJson('.claude/settings.json');
  if (settings?.env) {
    let removed = false;
    for (const key of TELEMETRY_ENV_KEYS) {
      if (key in settings.env) {
        delete settings.env[key];
        removed = true;
      }
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
    if (removed) {
      await context.writeJson('.claude/settings.json', settings);
      context.log('rimosse le variabili OTEL da settings.json (non funzionanti per la telemetria)');
    }
  }

  const config = await context.readJson('flow.config.json');
  const telemetry = config?.telemetry;
  if (telemetry?.enabled) {
    const existing = (await context.readText('.envrc')) ?? '';
    if (!existing.includes(ENVRC_BLOCK_START)) {
      const projectName = telemetry.projectName || basename(context.projectRoot);
      const block = [
        ENVRC_BLOCK_START,
        'export CLAUDE_CODE_ENABLE_TELEMETRY=1',
        'export OTEL_METRICS_EXPORTER=otlp',
        'export OTEL_LOGS_EXPORTER=otlp',
        `export OTEL_EXPORTER_OTLP_PROTOCOL=${telemetry.otlpProtocol ?? 'http/protobuf'}`,
        `export OTEL_EXPORTER_OTLP_ENDPOINT=${telemetry.otlpEndpoint}`,
        `export OTEL_SERVICE_NAME=${telemetry.serviceName ?? 'ai-dev-flow'}`,
        `export OTEL_RESOURCE_ATTRIBUTES=project.name=${projectName}`,
        'export OTEL_METRIC_EXPORT_INTERVAL=10000',
        ENVRC_BLOCK_END,
      ].join('\n');
      const next = existing.trim() === '' ? `${block}\n` : `${existing.replace(/\n*$/, '')}\n\n${block}\n`;
      await context.writeText('.envrc', next);
      context.log('scritto il blocco telemetria nel .envrc (esegui `direnv allow` per attivarlo)');
    }
  }
}
