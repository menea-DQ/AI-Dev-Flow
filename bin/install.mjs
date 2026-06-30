#!/usr/bin/env node
// AI-Dev Flow installer (deterministico, transazionale).
//
// Installa il kit PER-PROGETTO: abilita il plugin solo in questo progetto
// (enabledPlugins + extraKnownMarketplaces nel .claude/settings.json committato) e scaffolda
// gli artefatti per-progetto. NON tocca nulla a livello globale.
//
// Le DECISIONI dell'intervista (INSTALL.md, Passo 3) NON le prende questo script: arrivano già
// prese, passate via --decisions <file.json>. Se il file manca, usa i default del template e lo
// segnala (lo script non inferisce test e convenzioni).
//
// Uso:
//   node install.mjs [--kit <path-al-kit>] [--project <path>] [--decisions <file.json>] [--force]
//
// Proprietà:
//   • PER-PROGETTO: abilita il plugin solo nel progetto target, mai globalmente.
//   • TRANSAZIONALE: ogni file creato/modificato è tracciato; a errore → rollback totale.
//   • IDEMPOTENTE: se è già installato e coerente (stessa kitVersion), non rifà nulla.
//   • REVERSIBILE: scrive in flow.lock.json un manifest (file creati con hash, file modificati)
//     che bin/uninstall.mjs usa per ripulire con precisione.

import { mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KIT_ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER_START = '<!-- ai-dev-flow:start -->';
const MARKER_END = '<!-- ai-dev-flow:end -->';
const PLUGIN_NAME = 'ai-dev-flow';
const MARKETPLACE_NAME = 'ai-dev-flow';
const PONYTAIL_PLUGIN_NAME = 'ponytail';
const PONYTAIL_MARKETPLACE_NAME = 'ponytail';
const PONYTAIL_REPO = 'DietrichGebert/ponytail';
const ENVRC_BLOCK_START = '# >>> ai-dev-flow telemetry >>>';
const ENVRC_BLOCK_END = '# <<< ai-dev-flow telemetry <<<';

function parseArguments(argv) {
  const parsed = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--force') {
      parsed.force = true;
    } else if (token === '--kit') {
      parsed.kitRoot = argv[++index];
    } else if (token === '--project') {
      parsed.projectRoot = argv[++index];
    } else if (token === '--decisions') {
      parsed.decisionsPath = argv[++index];
    } else if (token === '--help' || token === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(targetPath) {
  if (!(await pathExists(targetPath))) {
    return null;
  }
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

function deepMerge(base, override) {
  if (override === null || override === undefined) {
    return base;
  }
  if (Array.isArray(base) || Array.isArray(override) || typeof base !== 'object' || typeof override !== 'object') {
    return override;
  }
  const merged = { ...base };
  for (const key of Object.keys(override)) {
    merged[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return merged;
}

function relativize(projectRoot, absolutePath) {
  return absolutePath.startsWith(`${projectRoot}/`) ? absolutePath.slice(projectRoot.length + 1) : absolutePath;
}

async function hashOfFile(targetPath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(targetPath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function listTopLevelDirectories(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort();
}

async function detectContexts(projectRoot) {
  const workspaceGlobs = await collectWorkspaceGlobs(projectRoot);
  const contexts = new Set();
  for (const glob of workspaceGlobs) {
    if (glob.endsWith('/*')) {
      const parent = join(projectRoot, glob.slice(0, -2));
      if (await pathExists(parent)) {
        for (const child of await listTopLevelDirectories(parent)) {
          contexts.add(join(glob.slice(0, -2), child));
        }
      }
    } else if (!glob.includes('*')) {
      contexts.add(glob);
    }
  }
  if (contexts.size === 0) {
    contexts.add('.');
  }
  return [...contexts].sort();
}

async function collectWorkspaceGlobs(projectRoot) {
  const globs = [];
  const workspaceFile = join(projectRoot, 'pnpm-workspace.yaml');
  if (await pathExists(workspaceFile)) {
    const text = await readFile(workspaceFile, 'utf8');
    for (const match of text.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/gm)) {
      globs.push(match[1].trim());
    }
  }
  const manifest = await readJsonIfPresent(join(projectRoot, 'package.json'));
  const packageWorkspaces = manifest && (Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages);
  if (Array.isArray(packageWorkspaces)) {
    globs.push(...packageWorkspaces);
  }
  return globs;
}

async function computeFilesHash(projectRoot) {
  const keyFiles = ['package.json', 'turbo.json', 'nx.json', 'pnpm-workspace.yaml', 'tsconfig.json'];
  const hash = createHash('sha256');
  for (const fileName of keyFiles) {
    const filePath = join(projectRoot, fileName);
    if (await pathExists(filePath)) {
      hash.update(`${fileName}:`);
      hash.update(await hashOfFile(filePath));
    }
  }
  for (const directoryName of await listTopLevelDirectories(projectRoot)) {
    hash.update(`dir:${directoryName};`);
  }
  return hash.digest('hex');
}

function kitMarketplaceSource(kitRoot) {
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: kitRoot, encoding: 'utf8' }).trim();
    const cleaned = remoteUrl.replace(/\.git$/, '');
    const segments = cleaned.split(/[/:]/).filter(Boolean);
    if (segments.length >= 2) {
      return { source: 'github', repo: segments.slice(-2).join('/') };
    }
  } catch {
    // nessun remote: ricado sulla sorgente directory locale
  }
  return { source: 'directory', path: kitRoot };
}

class TransactionalInstaller {
  constructor() {
    this.createdPaths = [];
    this.createdDirectories = [];
    this.modifiedBackups = new Map();
  }

  async createDirectory(targetPath) {
    if (!(await pathExists(targetPath))) {
      await mkdir(targetPath, { recursive: true });
      this.createdDirectories.unshift(targetPath);
    }
  }

  async createFile(targetPath, content) {
    await this.createDirectory(dirname(targetPath));
    await writeFile(targetPath, content, 'utf8');
    this.createdPaths.unshift(targetPath);
  }

  async modifyFile(targetPath, content) {
    if (!this.modifiedBackups.has(targetPath)) {
      this.modifiedBackups.set(targetPath, await readFile(targetPath, 'utf8'));
    }
    await writeFile(targetPath, content, 'utf8');
  }

  async rollback() {
    for (const [targetPath, originalContent] of this.modifiedBackups) {
      await writeFile(targetPath, originalContent, 'utf8');
    }
    for (const targetPath of this.createdPaths) {
      await rm(targetPath, { force: true });
    }
    for (const targetPath of this.createdDirectories) {
      await rm(targetPath, { recursive: true, force: true });
    }
  }
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Uso: node install.mjs [--kit <path>] [--project <path>] [--decisions <file.json>] [--force]');
    return;
  }

  const kitRoot = resolve(args.kitRoot ?? KIT_ROOT_DEFAULT);
  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  const lockPath = join(projectRoot, 'flow.lock.json');

  const kitVersion = (await readFile(join(kitRoot, 'VERSION'), 'utf8')).trim();
  console.log(`AI-Dev Flow installer — kit ${kitVersion}`);
  console.log(`  kit:     ${kitRoot}`);
  console.log(`  project: ${projectRoot}`);

  const existingLock = await readJsonIfPresent(lockPath);
  if (existingLock && existingLock.kitVersion === kitVersion && !args.force) {
    console.log(`Già installato e coerente (kitVersion ${kitVersion}). Niente da fare (usa --force per forzare).`);
    return;
  }

  const decisions = args.decisionsPath ? await readJsonIfPresent(resolve(args.decisionsPath)) : null;
  if (!decisions) {
    console.warn('ATTENZIONE: nessun file --decisions fornito. Uso i default del template.');
    console.warn('Le scelte di test e convenzioni NON vanno inferite: vanno raccolte in intervista (INSTALL.md, Passo 3).');
  }

  const installer = new TransactionalInstaller();
  try {
    const contexts = await detectContexts(projectRoot);
    console.log(`Contesti rilevati: ${contexts.join(', ')}`);

    const manifest = { createdFiles: [], createdDirectories: [], settings: null, claudeMd: null, envrc: null };

    const configTemplate = await readJsonIfPresent(join(kitRoot, 'project-files', 'flow.config.template.json'));
    const mergedConfig = deepMerge(configTemplate, decisions?.config ?? {});
    await installer.createFile(join(projectRoot, 'flow.config.json'), `${JSON.stringify(mergedConfig, null, 2)}\n`);
    manifest.createdFiles.push({ relPath: 'flow.config.json', userContent: true });

    manifest.settings = await enablePluginsForProject(installer, projectRoot, kitRoot, mergedConfig);
    manifest.envrc = await writeTelemetryEnvrc(installer, projectRoot, mergedConfig.telemetry);
    const agentInstructions = await installAgentInstructions(installer, kitRoot, projectRoot);
    if (agentInstructions.agentMd.fileCreatedByUs) {
      manifest.createdFiles.push({ relPath: 'AGENT.md', userContent: true });
    }
    manifest.claudeMd = agentInstructions.claudeMd;
    for (const relPath of await installArchitectureDocs(installer, kitRoot, projectRoot, contexts, decisions)) {
      manifest.createdFiles.push({ relPath, userContent: true });
    }
    const changelogRelPath = await initializeChangelog(installer, kitRoot, projectRoot, mergedConfig);
    if (changelogRelPath) {
      manifest.createdFiles.push({ relPath: changelogRelPath, userContent: true });
    }

    for (const entry of manifest.createdFiles) {
      entry.sha256 = await hashOfFile(join(projectRoot, entry.relPath));
    }
    manifest.createdDirectories = installer.createdDirectories
      .map((directoryPath) => relativize(projectRoot, directoryPath))
      .filter((relPath) => relPath && relPath !== projectRoot);

    const lock = {
      kitVersion,
      processVersion: kitVersion,
      installedAt: decisions?.installedAt ?? new Date().toISOString(),
      assessment: {
        type: (await pathExists(join(projectRoot, 'package.json'))) ? 'existing' : 'new',
        monorepo: contexts.length > 1 || contexts[0] !== '.',
        contexts,
        filesHash: await computeFilesHash(projectRoot),
      },
      install: manifest,
    };
    await installer.createFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    console.log('Installazione completata. Riapri il progetto in Claude Code per attivare plugin e hook.');
    console.log('Poi esegui il doctor (INSTALL.md, Passo 5) per la verifica. Per rimuovere tutto: skill `uninstall`.');
  } catch (error) {
    console.error('Errore durante l\'installazione, eseguo il rollback:', error.message);
    await installer.rollback();
    console.error('Rollback completato: il progetto è tornato allo stato precedente.');
    process.exitCode = 1;
  }
}

async function enablePluginsForProject(installer, projectRoot, kitRoot, mergedConfig) {
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  const settingsExisted = await pathExists(settingsPath);
  const settings = (await readJsonIfPresent(settingsPath)) ?? {};
  settings.enabledPlugins ??= {};
  settings.extraKnownMarketplaces ??= {};

  const enabledPluginKeys = [];
  const marketplaceNames = [];

  const ourPluginKey = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
  settings.enabledPlugins[ourPluginKey] = true;
  settings.extraKnownMarketplaces[MARKETPLACE_NAME] ??= { source: kitMarketplaceSource(kitRoot) };
  enabledPluginKeys.push(ourPluginKey);
  marketplaceNames.push(MARKETPLACE_NAME);

  const ponytailMode = mergedConfig?.tokenEconomy?.ponytail ?? 'off';
  if (ponytailMode !== 'off') {
    const ponytailPluginKey = `${PONYTAIL_PLUGIN_NAME}@${PONYTAIL_MARKETPLACE_NAME}`;
    settings.enabledPlugins[ponytailPluginKey] = true;
    settings.extraKnownMarketplaces[PONYTAIL_MARKETPLACE_NAME] ??= { source: { source: 'github', repo: PONYTAIL_REPO } };
    enabledPluginKeys.push(ponytailPluginKey);
    marketplaceNames.push(PONYTAIL_MARKETPLACE_NAME);
  }

  let envKeys = [];
  if (mergedConfig?.telemetry?.enabled) {
    const projectName = mergedConfig.telemetry.projectName || basename(projectRoot);
    const pairs = telemetryEnvPairs(mergedConfig.telemetry, projectName);
    settings.env ??= {};
    for (const [key, value] of Object.entries(pairs)) {
      settings.env[key] = value;
    }
    envKeys = Object.keys(pairs);
  }

  const serialized = `${JSON.stringify(settings, null, 2)}\n`;
  if (settingsExisted) {
    await installer.modifyFile(settingsPath, serialized);
  } else {
    await installer.createFile(settingsPath, serialized);
  }
  console.log(`Abilitati SOLO in questo progetto: ${enabledPluginKeys.join(', ')} (modalità Ponytail: ${ponytailMode}).`);
  return { relPath: '.claude/settings.json', fileCreatedByUs: !settingsExisted, enabledPluginKeys, marketplaceNames, envKeys };
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

function buildTelemetryEnvrcBlock(telemetry, projectName) {
  const exports = Object.entries(telemetryEnvPairs(telemetry, projectName)).map(([key, value]) => `export ${key}=${value}`);
  return [ENVRC_BLOCK_START, ...exports, ENVRC_BLOCK_END].join('\n');
}

async function writeTelemetryEnvrc(installer, projectRoot, telemetry) {
  if (!telemetry?.enabled) {
    return null;
  }
  const envrcPath = join(projectRoot, '.envrc');
  const existed = await pathExists(envrcPath);
  const existing = existed ? await readFile(envrcPath, 'utf8') : '';
  if (existing.includes(ENVRC_BLOCK_START)) {
    return { relPath: '.envrc', fileCreatedByUs: false, blockAdded: false };
  }
  const projectName = telemetry.projectName || basename(projectRoot);
  const block = buildTelemetryEnvrcBlock(telemetry, projectName);
  if (existed) {
    await installer.modifyFile(envrcPath, `${existing.replace(/\n*$/, '')}\n\n${block}\n`);
  } else {
    await installer.createFile(envrcPath, `${block}\n`);
  }
  console.log(`Telemetria scritta in .envrc (endpoint ${telemetry.otlpEndpoint}). Esegui \`direnv allow\` per attivarla (richiede direnv).`);
  return { relPath: '.envrc', fileCreatedByUs: !existed, blockAdded: true };
}

async function installAgentInstructions(installer, kitRoot, projectRoot) {
  const agentPath = join(projectRoot, 'AGENT.md');
  const agentExisted = await pathExists(agentPath);
  if (!agentExisted) {
    await installer.createFile(agentPath, await readFile(join(kitRoot, 'templates', 'AGENT.md'), 'utf8'));
    console.log('Creato AGENT.md dal template.');
  } else {
    console.log('AGENT.md già presente: lasciato invariato.');
  }

  const claudePath = join(projectRoot, 'CLAUDE.md');
  const claudeExisted = await pathExists(claudePath);
  const block = `${MARKER_START}\nQuesto progetto usa AI-Dev Flow. Le istruzioni operative sono in AGENT.md (agnostico).\nLeggi AGENT.md e seguilo. Versione del processo: vedi flow.lock.json.\n${MARKER_END}\n`;
  let blockAdded = false;
  if (!claudeExisted) {
    await installer.createFile(claudePath, `# CLAUDE.md\n${block}`);
    blockAdded = true;
    console.log('Creato CLAUDE.md con il blocco AI-Dev Flow.');
  } else {
    const existing = await readFile(claudePath, 'utf8');
    if (!existing.includes(MARKER_START)) {
      await installer.modifyFile(claudePath, `${block}\n${existing}`);
      blockAdded = true;
      console.log('Aggiunto il blocco AI-Dev Flow in cima a CLAUDE.md (contenuto preesistente preservato).');
    } else {
      console.log('CLAUDE.md già contiene il blocco AI-Dev Flow: lasciato invariato.');
    }
  }

  return {
    agentMd: { relPath: 'AGENT.md', fileCreatedByUs: !agentExisted },
    claudeMd: { relPath: 'CLAUDE.md', fileCreatedByUs: !claudeExisted, blockAdded },
  };
}

async function installArchitectureDocs(installer, kitRoot, projectRoot, contexts, decisions) {
  const consentedContexts = decisions?.architectureContexts ?? contexts;
  const template = await readFile(join(kitRoot, 'templates', 'architecture.md'), 'utf8');
  const createdRelPaths = [];
  for (const context of consentedContexts) {
    const relPath = context === '.' ? 'architecture.md' : join(context, 'architecture.md');
    const targetPath = join(projectRoot, relPath);
    if (await pathExists(targetPath)) {
      console.log(`architecture.md già presente per "${context}": registrato, non sovrascritto.`);
      continue;
    }
    const filled = template.replace('[nome contesto]', context === '.' ? basename(projectRoot) : context);
    await installer.createFile(targetPath, filled);
    createdRelPaths.push(relPath);
    console.log(`Creato documento di architettura per "${context}".`);
  }
  return createdRelPaths;
}

async function initializeChangelog(installer, kitRoot, projectRoot, config) {
  const relPath = config.changelog?.path ?? '.ai-dev/changelog.md';
  const changelogPath = join(projectRoot, relPath);
  if (await pathExists(changelogPath)) {
    console.log('Changelog già presente: lasciato invariato.');
    return null;
  }
  await installer.createFile(changelogPath, await readFile(join(kitRoot, 'templates', 'changelog.md'), 'utf8'));
  console.log('Inizializzato changelog vuoto.');
  return relPath;
}

run();
