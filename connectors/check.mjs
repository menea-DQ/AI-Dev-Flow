#!/usr/bin/env node
// Contract-check dei connettori: verifica che le integrazioni esterne (Productive, Zammad, …)
// rispondano ancora come previsto, segnalando subito eventuali rotture (auth/API cambiata)
// PRIMA che blocchino il lavoro.
//
// Esegue il probe (--check) di ogni connettore configurato in flow.config.connectors e, se viene
// passato un id/url di esempio, valida anche la forma dell'output contro contract.schema.json.
//
// Uso:
//   node check.mjs [--project <path>] [--sample-ticketing <url-o-id>] [--sample-helpdesk <url>]
// Exit code: 0 se tutti ok/avvisi non bloccanti; 1 se un connettore risulta ROTTO (auth/drift).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const CONNECTORS_DIR = dirname(fileURLToPath(import.meta.url));
const REQUIRED_CONTRACT_FIELDS = ['connector', 'kind', 'id', 'title'];

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') {
      parsed.projectRoot = argv[++index];
    } else if (argv[index] === '--sample-ticketing') {
      parsed.sampleTicketing = argv[++index];
    } else if (argv[index] === '--sample-helpdesk') {
      parsed.sampleHelpdesk = argv[++index];
    }
  }
  return parsed;
}

function runConnector(connectorName, connectorArgs) {
  return new Promise((resolveRun) => {
    const child = spawn('node', [join(CONNECTORS_DIR, `${connectorName}.mjs`), ...connectorArgs], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
    child.on('error', (error) => resolveRun({ code: 1, stdout: '', stderr: error.message }));
  });
}

function validateContractShape(normalized) {
  const missing = REQUIRED_CONTRACT_FIELDS.filter((field) => normalized[field] === undefined || normalized[field] === null);
  if (missing.length > 0) {
    return { valid: false, detail: `Campi mancanti nell'output normalizzato: ${missing.join(', ')}` };
  }
  if (!['ticketing', 'helpdesk'].includes(normalized.kind)) {
    return { valid: false, detail: `kind non valido: ${normalized.kind}` };
  }
  return { valid: true };
}

async function checkConnector(role, connectorName, sampleReference) {
  if (!connectorName) {
    return { role, connector: null, ok: true, status: 'not-configured', detail: 'Nessun connettore configurato per questo ruolo.' };
  }
  if (!existsSync(join(CONNECTORS_DIR, `${connectorName}.mjs`))) {
    return { role, connector: connectorName, ok: false, status: 'missing-file', detail: `Connettore non trovato: ${connectorName}.mjs` };
  }

  const probe = await runConnector(connectorName, ['--check']);
  let probeResult;
  try {
    probeResult = JSON.parse(probe.stdout.trim().split('\n').pop());
  } catch {
    probeResult = { ok: false, status: 'probe-error', detail: probe.stderr || 'Output del probe non interpretabile.' };
  }

  if (sampleReference && probeResult.ok) {
    const fetched = await runConnector(connectorName, [sampleReference]);
    if (fetched.code !== 0) {
      return { role, connector: connectorName, ok: false, status: 'fetch-failed', detail: fetched.stderr.trim() };
    }
    try {
      const shape = validateContractShape(JSON.parse(fetched.stdout));
      if (!shape.valid) {
        return { role, connector: connectorName, ok: false, status: 'contract-mismatch', detail: shape.detail };
      }
      return { role, connector: connectorName, ok: true, status: 'ok', detail: 'Probe ok + contratto rispettato sul campione.' };
    } catch (error) {
      return { role, connector: connectorName, ok: false, status: 'contract-mismatch', detail: `Output non JSON: ${error.message}` };
    }
  }

  return { role, connector: connectorName, ...probeResult };
}

function loadConnectorsConfig(projectRoot) {
  const configPath = join(projectRoot, 'flow.config.json');
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')).connectors ?? {};
  } catch {
    return {};
  }
}

const BROKEN_STATUSES = new Set(['auth-failed', 'drift', 'fetch-failed', 'contract-mismatch', 'missing-file', 'unreachable']);

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  process.chdir(projectRoot);
  const connectors = loadConnectorsConfig(projectRoot);

  const results = [
    await checkConnector('ticketing', connectors.ticketing, args.sampleTicketing),
    await checkConnector('helpdesk', connectors.helpdesk, args.sampleHelpdesk),
  ];

  console.log('=== Contract-check connettori ===');
  let broken = false;
  for (const result of results) {
    const symbol = result.ok ? 'OK ' : (BROKEN_STATUSES.has(result.status) ? 'ROTTO' : 'AVVISO');
    if (BROKEN_STATUSES.has(result.status)) {
      broken = true;
    }
    console.log(`  [${symbol}] ${result.role}: ${result.connector ?? '—'} (${result.status}) — ${result.detail}`);
  }
  if (broken) {
    console.log('Almeno un connettore è ROTTO: l\'intake da ticket/helpdesk fallirà finché non è risolto.');
    process.exitCode = 1;
  }
}

run();
