// Migrazione 0.0.1 → 0.0.2
// Allinea gli artefatti di un progetto installato con 0.0.1 ai campi introdotti in 0.0.2:
// connettori pronti (Productive/Zammad), blocco telemetry, dataProducingPaths, pathPatterns nel
// test-playbook, e — se la telemetria è attiva — il blocco env OTEL nel settings.json.
// Idempotente: tocca solo ciò che manca.

import { basename } from 'node:path';

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  if (!config) {
    context.log('flow.config.json assente: niente da migrare.');
    return;
  }

  if (!config.telemetry) {
    config.telemetry = {
      enabled: true,
      otlpEndpoint: 'http://localhost:4318',
      otlpProtocol: 'http/protobuf',
      serviceName: 'ai-dev-flow',
      projectName: null,
    };
    context.log('aggiunto blocco telemetry');
  }

  config.connectors ??= {};
  if (!config.connectors.ticketing) {
    config.connectors.ticketing = 'productive';
    context.log('connectors.ticketing = productive');
  }
  if (!config.connectors.helpdesk) {
    config.connectors.helpdesk = 'zammad';
    context.log('connectors.helpdesk = zammad');
  }
  config.connectors.envFile ??= '.ai-dev/connectors.env';
  config.connectors.instances ??= {};

  if (!Array.isArray(config.dataProducingPaths)) {
    config.dataProducingPaths = [];
    context.log('aggiunto dataProducingPaths');
  }

  if (config.testPlaybook && typeof config.testPlaybook === 'object') {
    for (const entry of Object.values(config.testPlaybook)) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry.pathPatterns)) {
        entry.pathPatterns = [];
      }
    }
  }

  await context.writeJson('flow.config.json', config);

  if (config.telemetry?.enabled) {
    const settings = (await context.readJson('.claude/settings.json')) ?? {};
    settings.env ??= {};
    const projectName = config.telemetry.projectName || basename(context.projectRoot);
    const telemetryEnv = {
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: config.telemetry.otlpProtocol ?? 'http/protobuf',
      OTEL_EXPORTER_OTLP_ENDPOINT: config.telemetry.otlpEndpoint,
      OTEL_SERVICE_NAME: config.telemetry.serviceName ?? 'ai-dev-flow',
      OTEL_RESOURCE_ATTRIBUTES: `project.name=${projectName}`,
    };
    let added = false;
    for (const [key, value] of Object.entries(telemetryEnv)) {
      if (settings.env[key] === undefined) {
        settings.env[key] = value;
        added = true;
      }
    }
    if (added) {
      await context.writeJson('.claude/settings.json', settings);
      context.log('aggiunte le variabili env OTEL al .claude/settings.json');
    }
  }
}
