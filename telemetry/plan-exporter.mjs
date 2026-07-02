#!/usr/bin/env node
// Esporta in formato Prometheus la mappatura utente -> piano di abbonamento Claude Code, letta da
// plans.json (versionato in repo). Serve a calcolare il costo REALE fatturato all'azienda (quota fissa
// per chi è in abbonamento Pro/Max, 0 per chi è su API key dove il costo reale è già claude_code.cost.usage),
// distinto dal "valore equivalente a token" che Claude Code esporta sempre a pricing API a consumo.
// Uso: node plan-exporter.mjs  (porta: env PLAN_EXPORTER_PORT, default 9105)

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const plansFilePath = join(dirname(fileURLToPath(import.meta.url)), 'plans.json');
const port = Number(process.env.PLAN_EXPORTER_PORT ?? 9105);

function loadPlans() {
  const plans = JSON.parse(readFileSync(plansFilePath, 'utf8'));
  if (!Array.isArray(plans)) {
    throw new Error(`${plansFilePath} deve contenere un array`);
  }
  return plans;
}

function escapeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderMetrics(plans) {
  const lines = [
    '# HELP ai_dev_flow_plan_cost_monthly_usd Costo mensile fisso dell\'abbonamento Claude Code per utente (0 per chi è su API key a consumo).',
    '# TYPE ai_dev_flow_plan_cost_monthly_usd gauge',
  ];
  for (const entry of plans) {
    const labels = [
      `user_email="${escapeLabelValue(entry.user_email)}"`,
      `plan="${escapeLabelValue(entry.plan)}"`,
      `billing_type="${escapeLabelValue(entry.billing_type)}"`,
    ].join(',');
    lines.push(`ai_dev_flow_plan_cost_monthly_usd{${labels}} ${Number(entry.monthly_cost_usd) || 0}`);
  }
  return `${lines.join('\n')}\n`;
}

const server = createServer((request, response) => {
  if (request.url !== '/metrics') {
    response.writeHead(404).end('not found\n');
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' }).end(renderMetrics(loadPlans()));
  } catch (error) {
    response.writeHead(500).end(`errore lettura ${plansFilePath}: ${error.message}\n`);
  }
});

server.listen(port, () => {
  process.stdout.write(`plan-exporter in ascolto su :${port}/metrics (fonte: ${plansFilePath})\n`);
});
