#!/usr/bin/env node
// Hook PreToolUse (Skill | mcp__*): enforcement del perimetro dello standard (GAP-03).
// Nei progetti dove AI-Dev Flow è installato si usano SOLO i componenti installati dal kit:
// le skill del kit, Ponytail (abilitato dal kit stesso) e ciò che il progetto ha esplicitamente
// whitelistato in flow.config.perimeter. Tutto il resto (skill personali, server MCP utente)
// è bloccato: il flusso deve essere identico per chiunque apra il progetto.
//
// Config (flow.config.json):
//   "perimeter": { "enforce": true, "allowedMcpServers": [], "allowedSkills": [] }
// Con enforce=false il guard è disattivo (sconsigliato: il perimetro è parte dello standard).

import { readHookInput, isFlowProject, loadFlowConfig, blockWithInstruction } from './hookShared.mjs';

// Le skill che il kit stesso fornisce (sempre ammesse nei progetti dove è installato).
const KIT_SKILLS = new Set([
  'install', 'uninstall', 'migrate', 'flow-settings', 'connectors-check', 'doctor',
  'flow', 'intake-parser', 'spec-context', 'impl-runbook', 'test-selector',
]);
const ALLOWED_SKILL_PREFIXES = ['ai-dev-flow:', 'ponytail'];

const input = await readHookInput();
if (!isFlowProject()) {
  process.exit(0);
}

const config = loadFlowConfig();
const perimeter = config.perimeter ?? {};
if (perimeter.enforce !== true) {
  process.exit(0);
}

const toolName = input?.tool_name ?? '';

// ————— Server MCP —————
if (toolName.startsWith('mcp__')) {
  const serverName = toolName.split('__')[1] ?? '';
  const allowedServers = perimeter.allowedMcpServers ?? [];
  if (allowedServers.includes(serverName)) {
    process.exit(0);
  }
  blockWithInstruction(
    `[AI-Dev Flow · perimetro] Il server MCP "${serverName}" non fa parte del perimetro di questo progetto.\n` +
    `Lo standard AI-Dev Flow ammette SOLO i componenti installati dal kit (più le whitelist esplicite di progetto):\n` +
    `un componente esterno rende il flusso diverso da quello dei colleghi.\n` +
    `Se questo server serve davvero al progetto, va whitelistato in modo esplicito e committato:\n` +
    `skill flow-settings → perimeter.allowedMcpServers (decisione dell'utente, non tua).\n`,
  );
}

// ————— Skill —————
if (toolName === 'Skill') {
  const rawSkillName = String(input?.tool_input?.skill ?? input?.tool_input?.name ?? '');
  const bareName = rawSkillName.includes(':') ? rawSkillName.split(':').pop() : rawSkillName;
  const allowedSkills = perimeter.allowedSkills ?? [];
  const isAllowed =
    KIT_SKILLS.has(bareName) ||
    ALLOWED_SKILL_PREFIXES.some((prefix) => rawSkillName.startsWith(prefix)) ||
    allowedSkills.includes(rawSkillName) ||
    allowedSkills.includes(bareName);
  if (isAllowed) {
    process.exit(0);
  }
  blockWithInstruction(
    `[AI-Dev Flow · perimetro] La skill "${rawSkillName}" non fa parte del perimetro di questo progetto.\n` +
    `Lo standard AI-Dev Flow ammette SOLO le skill del kit (più Ponytail e le whitelist esplicite di progetto).\n` +
    `Se questa skill serve davvero al progetto: skill flow-settings → perimeter.allowedSkills ` +
    `(decisione dell'utente, non tua). Altrimenti prosegui con gli strumenti del kit.\n`,
  );
}

process.exit(0);
