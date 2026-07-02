#!/usr/bin/env node
// AI-Dev Flow — riallineamento telemetria (GAP-15).
//
// flow.config.telemetry è la SORGENTE DI INTENTO; ciò che attiva davvero l'OTEL sono i blocchi in
// .envrc (direnv) e .claude/settings.json (env). Questo script li rigenera o li rimuove, così
// "telemetry.enabled=false" torna a essere vero: config e realtà non divergono.
//
// Uso:
//   node telemetry.mjs [--project <path>] --apply    # (ri)scrive i blocchi secondo flow.config.telemetry
//   node telemetry.mjs [--project <path>] --remove   # rimuove i blocchi (equivale a enabled=false)
//   node telemetry.mjs [--project <path>] --status   # riporta la coerenza config ↔ attivazione

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const ENVRC_BLOCK_START = '# >>> ai-dev-flow telemetry >>>';
const ENVRC_BLOCK_END = '# <<< ai-dev-flow telemetry <<<';
const TELEMETRY_ENV_KEYS = ['CLAUDE_CODE_ENABLE_TELEMETRY', 'OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE', 'OTEL_SERVICE_NAME', 'OTEL_RESOURCE_ATTRIBUTES', 'OTEL_METRIC_EXPORT_INTERVAL'];

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') {
      parsed.projectRoot = argv[++index];
    } else if (argv[index] === '--apply') {
      parsed.mode = 'apply';
    } else if (argv[index] === '--remove') {
      parsed.mode = 'remove';
    } else if (argv[index] === '--status') {
      parsed.mode = 'status';
    }
  }
  return parsed;
}

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

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeEnvrcBlock(envrcPath) {
  if (!existsSync(envrcPath)) {
    return false;
  }
  const content = readFileSync(envrcPath, 'utf8');
  if (!content.includes(ENVRC_BLOCK_START)) {
    return false;
  }
  const blockPattern = new RegExp(`\\n*${escapeForRegExp(ENVRC_BLOCK_START)}[\\s\\S]*?${escapeForRegExp(ENVRC_BLOCK_END)}\\n?`);
  const cleaned = content.replace(blockPattern, '\n').replace(/^\n+/, '');
  if (cleaned.trim() === '') {
    rmSync(envrcPath, { force: true });
  } else {
    writeFileSync(envrcPath, cleaned, 'utf8');
  }
  return true;
}

function writeEnvrcBlock(envrcPath, telemetry, projectName) {
  const exports = Object.entries(telemetryEnvPairs(telemetry, projectName)).map(([key, value]) => `export ${key}=${value}`);
  const block = [ENVRC_BLOCK_START, ...exports, ENVRC_BLOCK_END].join('\n');
  removeEnvrcBlock(envrcPath); // rigenerazione pulita
  const existing = existsSync(envrcPath) ? readFileSync(envrcPath, 'utf8') : '';
  const next = existing.trim() === '' ? `${block}\n` : `${existing.replace(/\n*$/, '')}\n\n${block}\n`;
  writeFileSync(envrcPath, next, 'utf8');
}

function updateSettingsEnv(settingsPath, pairsOrNull) {
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  if (pairsOrNull) {
    settings.env = { ...(settings.env ?? {}), ...pairsOrNull };
  } else if (settings.env) {
    for (const key of TELEMETRY_ENV_KEYS) {
      delete settings.env[key];
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }
  if (Object.keys(settings).length > 0 || existsSync(settingsPath)) {
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }
}

function run() {
  const args = parseArguments(process.argv.slice(2));
  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  const configPath = join(projectRoot, 'flow.config.json');
  if (!existsSync(configPath)) {
    console.error('flow.config.json assente: il kit non è installato qui.');
    process.exitCode = 1;
    return;
  }
  const telemetry = JSON.parse(readFileSync(configPath, 'utf8')).telemetry ?? {};
  const envrcPath = join(projectRoot, '.envrc');
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  const blockPresent = existsSync(envrcPath) && readFileSync(envrcPath, 'utf8').includes(ENVRC_BLOCK_START);

  if (args.mode === 'status' || !args.mode) {
    const coherent = Boolean(telemetry.enabled) === blockPresent;
    console.log(`telemetry.enabled=${Boolean(telemetry.enabled)} · blocco .envrc ${blockPresent ? 'PRESENTE' : 'ASSENTE'} → ${coherent ? 'COERENTE' : 'INCOERENTE'}`);
    if (!coherent) {
      console.log(`Azione: node telemetry.mjs --project "${projectRoot}" ${telemetry.enabled ? '--apply' : '--remove'}`);
      process.exitCode = 1;
    }
    return;
  }

  if (args.mode === 'remove' || (args.mode === 'apply' && !telemetry.enabled)) {
    const removed = removeEnvrcBlock(envrcPath);
    updateSettingsEnv(settingsPath, null);
    console.log(removed ? 'Blocchi telemetria rimossi (.envrc + settings.json). La telemetria è spenta.' : 'Nessun blocco telemetria da rimuovere; settings.json ripulito.');
    return;
  }

  // apply con enabled=true
  const projectName = telemetry.projectName || basename(projectRoot);
  writeEnvrcBlock(envrcPath, telemetry, projectName);
  updateSettingsEnv(settingsPath, telemetryEnvPairs(telemetry, projectName));
  console.log(`Blocchi telemetria rigenerati (endpoint ${telemetry.otlpEndpoint}). Esegui \`direnv allow\` se richiesto.`);
}

run();
