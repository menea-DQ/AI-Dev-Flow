#!/usr/bin/env node
// AI-Dev Flow installer (deterministico, transazionale).
//
// Esegue le operazioni meccaniche dell'installazione descritte in INSTALL.md (Passo 4).
// Le DECISIONI dell'intervista (Passo 3) NON le prende questo script: arrivano già prese,
// passate via --decisions <file.json>. Se il file manca, usa i default del template e lo
// segnala (lo script non inferisce test e convenzioni: è compito dell'intervista a monte).
//
// Fallback senza Node: l'agente esegue gli stessi passi a mano, sono elencati in stepPlan().
//
// Uso:
//   node install.mjs --kit <path-al-kit> [--project <path>] [--decisions <file.json>] [--force]
//
// Proprietà:
//   • TRANSAZIONALE: ogni file creato/modificato è tracciato; a errore → rollback totale.
//   • IDEMPOTENTE: se è già installato e coerente (stessa kitVersion), non rifà nulla.

import { mkdir, writeFile, readFile, readdir, stat, access, copyFile, rm } from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KIT_ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER_START = '<!-- ai-dev-flow:start -->';
const MARKER_END = '<!-- ai-dev-flow:end -->';

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
  const text = await readFile(targetPath, 'utf8');
  return JSON.parse(text);
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

async function hashOfFile(targetPath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(targetPath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function listTopLevelDirectories(projectRoot) {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort();
}

async function detectContexts(projectRoot) {
  const workspaceFile = join(projectRoot, 'pnpm-workspace.yaml');
  const contexts = new Set();
  if (await pathExists(workspaceFile)) {
    const text = await readFile(workspaceFile, 'utf8');
    const globs = [...text.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map((match) => match[1].trim());
    for (const glob of globs) {
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
  }
  if (contexts.size === 0) {
    const manifest = await readJsonIfPresent(join(projectRoot, 'package.json'));
    const workspaces = manifest && (Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages);
    if (Array.isArray(workspaces) && workspaces.length > 0) {
      for (const glob of workspaces) {
        if (!glob.includes('*')) {
          contexts.add(glob);
        }
      }
    }
  }
  if (contexts.size === 0) {
    contexts.add('.');
  }
  return [...contexts].sort();
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

function deriveSkillFrontmatter(skillName, skillBody) {
  const scopeMatch = skillBody.match(/^Scopo:\s*(.+)$/m);
  const whenMatch = skillBody.match(/^Quando usarla:\s*(.+)$/m);
  const description = [scopeMatch?.[1]?.trim(), whenMatch?.[1]?.trim()].filter(Boolean).join(' — ');
  return `---\nname: ${skillName}\ndescription: ${description || skillName}\n---\n\n`;
}

class TransactionalInstaller {
  constructor(projectRoot, kitRoot) {
    this.projectRoot = projectRoot;
    this.kitRoot = kitRoot;
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
    console.log('Uso: node install.mjs --kit <path> [--project <path>] [--decisions <file.json>] [--force]');
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

  const installer = new TransactionalInstaller(projectRoot, kitRoot);
  try {
    const contexts = await detectContexts(projectRoot);
    console.log(`Contesti rilevati: ${contexts.join(', ')}`);

    const configTemplate = await readJsonIfPresent(join(kitRoot, 'project-files', 'flow.config.template.json'));
    const mergedConfig = deepMerge(configTemplate, decisions?.config ?? {});
    await installer.createFile(join(projectRoot, 'flow.config.json'), `${JSON.stringify(mergedConfig, null, 2)}\n`);

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
    };
    await installer.createFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    await installSkills(installer, kitRoot, projectRoot);
    await installAdapterReference(installer, kitRoot, projectRoot);
    await installAgentInstructions(installer, kitRoot, projectRoot);
    await installArchitectureDocs(installer, kitRoot, projectRoot, contexts, decisions);
    await initializeChangelog(installer, kitRoot, projectRoot, mergedConfig);

    console.log('Installazione completata. Esegui il doctor (INSTALL.md, Passo 5) per la verifica.');
  } catch (error) {
    console.error('Errore durante l\'installazione, eseguo il rollback:', error.message);
    await installer.rollback();
    console.error('Rollback completato: il progetto è tornato allo stato precedente.');
    process.exitCode = 1;
  }
}

async function installSkills(installer, kitRoot, projectRoot) {
  const skillsDirectory = join(kitRoot, 'skills');
  const skillFiles = (await readdir(skillsDirectory)).filter((name) => name.endsWith('.md'));
  for (const fileName of skillFiles) {
    const skillName = basename(fileName, '.md');
    const skillBody = await readFile(join(skillsDirectory, fileName), 'utf8');
    const frontmatter = deriveSkillFrontmatter(skillName, skillBody);
    const targetPath = join(projectRoot, '.claude', 'skills', skillName, 'SKILL.md');
    await installer.createFile(targetPath, frontmatter + skillBody);
  }
  console.log(`Installate ${skillFiles.length} skill in .claude/skills/.`);
}

async function installAdapterReference(installer, kitRoot, projectRoot) {
  const sourceDirectory = join(kitRoot, 'adapters', 'claude-code');
  const targetDirectory = join(projectRoot, '.ai-dev', 'adapters', 'claude-code');
  await copyDirectory(installer, sourceDirectory, targetDirectory);
  console.log('Copiati gli hook/sub-agent (spec di riferimento) in .ai-dev/adapters/claude-code/.');
  console.log('NOTA (beta 0.0.1): gli hook restano spec di processo; il wiring agli eventi reali di');
  console.log('Claude Code (settings.json) non è automatico in questa versione.');
}

async function copyDirectory(installer, sourceDirectory, targetDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDirectory, entry.name);
    const targetPath = join(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(installer, sourcePath, targetPath);
    } else {
      await installer.createDirectory(dirname(targetPath));
      await copyFile(sourcePath, targetPath);
      installer.createdPaths.unshift(targetPath);
    }
  }
}

async function installAgentInstructions(installer, kitRoot, projectRoot) {
  const agentPath = join(projectRoot, 'AGENT.md');
  if (!(await pathExists(agentPath))) {
    const template = await readFile(join(kitRoot, 'templates', 'AGENT.md'), 'utf8');
    await installer.createFile(agentPath, template);
    console.log('Creato AGENT.md dal template.');
  } else {
    console.log('AGENT.md già presente: lasciato invariato.');
  }

  const claudePath = join(projectRoot, 'CLAUDE.md');
  const block = `${MARKER_START}\nQuesto progetto usa AI-Dev Flow. Le istruzioni operative sono in AGENT.md (agnostico).\nLeggi AGENT.md e seguilo. Versione del processo: vedi flow.lock.json.\n${MARKER_END}\n`;
  if (!(await pathExists(claudePath))) {
    await installer.createFile(claudePath, `# CLAUDE.md\n${block}`);
    console.log('Creato CLAUDE.md con il blocco AI-Dev Flow.');
  } else {
    const existing = await readFile(claudePath, 'utf8');
    if (!existing.includes(MARKER_START)) {
      await installer.modifyFile(claudePath, `${block}\n${existing}`);
      console.log('Aggiunto il blocco AI-Dev Flow in cima a CLAUDE.md (contenuto preesistente preservato).');
    } else {
      console.log('CLAUDE.md già contiene il blocco AI-Dev Flow: lasciato invariato.');
    }
  }
}

async function installArchitectureDocs(installer, kitRoot, projectRoot, contexts, decisions) {
  const consentedContexts = decisions?.architectureContexts ?? contexts;
  const template = await readFile(join(kitRoot, 'templates', 'architecture.md'), 'utf8');
  for (const context of consentedContexts) {
    const targetPath = context === '.' ? join(projectRoot, 'architecture.md') : join(projectRoot, context, 'architecture.md');
    if (await pathExists(targetPath)) {
      console.log(`architecture.md già presente per "${context}": registrato, non sovrascritto.`);
      continue;
    }
    const filled = template.replace('[nome contesto]', context === '.' ? basename(projectRoot) : context);
    await installer.createFile(targetPath, filled);
    console.log(`Creato documento di architettura per "${context}".`);
  }
}

async function initializeChangelog(installer, kitRoot, projectRoot, config) {
  const changelogPath = join(projectRoot, config.changelog?.path ?? '.ai-dev/changelog.md');
  if (await pathExists(changelogPath)) {
    console.log('Changelog già presente: lasciato invariato.');
    return;
  }
  const template = await readFile(join(kitRoot, 'templates', 'changelog.md'), 'utf8');
  await installer.createFile(changelogPath, template);
  console.log('Inizializzato changelog vuoto.');
}

run();
