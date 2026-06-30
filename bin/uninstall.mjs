#!/usr/bin/env node
// AI-Dev Flow uninstaller (per-progetto).
//
// Rimuove ciò che l'install ha aggiunto al progetto, usando il manifest in flow.lock.json:
//   • disabilita il plugin nel progetto (rimuove enabledPlugins + extraKnownMarketplaces dal
//     .claude/settings.json, senza toccare le altre impostazioni);
//   • rimuove il blocco AI-Dev Flow da CLAUDE.md (preservando il resto);
//   • elimina i file creati dall'install; flow.lock.json per ultimo.
//
// SICUREZZA: i file che possono contenere lavoro dell'utente (flow.config.json, AGENT.md,
// documenti di architettura, changelog) vengono RIMOSSI solo se non sono stati modificati dopo
// l'install (hash invariato). Se l'utente li ha modificati, vengono PRESERVATI e segnalati,
// a meno di passare --purge (rimuove tutto comunque).
//
// Uso:
//   node uninstall.mjs [--project <path>] [--purge] [--help]

import { readFile, writeFile, rm, readdir, access } from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const MARKER_START = '<!-- ai-dev-flow:start -->';
const MARKER_END = '<!-- ai-dev-flow:end -->';
const DEFAULT_SETTINGS = { relPath: '.claude/settings.json', fileCreatedByUs: false, enabledPluginKeys: ['ai-dev-flow@ai-dev-flow'], marketplaceNames: ['ai-dev-flow'] };

function parseArguments(argv) {
  const parsed = { purge: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--purge') {
      parsed.purge = true;
    } else if (token === '--project') {
      parsed.projectRoot = argv[++index];
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

async function hashOfFile(targetPath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(targetPath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Uso: node uninstall.mjs [--project <path>] [--purge]');
    return;
  }

  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  const lockPath = join(projectRoot, 'flow.lock.json');
  const lock = await readJsonIfPresent(lockPath);
  if (!lock) {
    console.log('Nessuna installazione AI-Dev Flow qui (flow.lock.json assente). Niente da fare.');
    return;
  }

  const manifest = lock.install ?? fallbackManifest();
  if (!lock.install) {
    console.warn('flow.lock.json senza manifest (installazione precedente): rimozione best-effort.');
  }

  const removed = [];
  const kept = [];

  await disablePluginInSettings(projectRoot, manifest.settings ?? DEFAULT_SETTINGS, removed);
  await removeClaudeBlock(projectRoot, manifest.claudeMd, removed);
  for (const entry of manifest.createdFiles ?? []) {
    await removeCreatedFile(projectRoot, entry, args.purge, removed, kept);
  }

  await rm(lockPath, { force: true });
  removed.push('flow.lock.json');

  await removeEmptyDirectories(projectRoot, manifest.createdDirectories ?? []);

  console.log('=== Disinstallazione AI-Dev Flow ===');
  console.log('Rimossi:');
  for (const relPath of removed) {
    console.log(`  - ${relPath}`);
  }
  if (kept.length > 0) {
    console.log('Preservati (modificati dopo l\'install — usa --purge per rimuoverli):');
    for (const relPath of kept) {
      console.log(`  - ${relPath}`);
    }
  }
  console.log('');
  console.log('Il plugin è disabilitato in questo progetto. Per rimuovere anche la cache del marketplace');
  console.log('a livello utente (opzionale): /plugin marketplace remove ai-dev-flow');
}

function fallbackManifest() {
  return {
    createdFiles: [{ relPath: 'flow.config.json', userContent: true }],
    createdDirectories: ['.ai-dev'],
    settings: DEFAULT_SETTINGS,
    claudeMd: { relPath: 'CLAUDE.md', fileCreatedByUs: false, blockAdded: true },
  };
}

async function disablePluginInSettings(projectRoot, settingsDescriptor, removed) {
  const settingsPath = join(projectRoot, settingsDescriptor.relPath);
  if (!(await pathExists(settingsPath))) {
    return;
  }
  const settings = await readJsonIfPresent(settingsPath);
  const pluginKeys = settingsDescriptor.enabledPluginKeys ?? (settingsDescriptor.pluginKey ? [settingsDescriptor.pluginKey] : []);
  const marketplaceNames = settingsDescriptor.marketplaceNames ?? (settingsDescriptor.marketplaceName ? [settingsDescriptor.marketplaceName] : []);
  if (settings.enabledPlugins) {
    for (const pluginKey of pluginKeys) {
      delete settings.enabledPlugins[pluginKey];
    }
    if (Object.keys(settings.enabledPlugins).length === 0) {
      delete settings.enabledPlugins;
    }
  }
  if (settings.extraKnownMarketplaces) {
    for (const marketplaceName of marketplaceNames) {
      delete settings.extraKnownMarketplaces[marketplaceName];
    }
    if (Object.keys(settings.extraKnownMarketplaces).length === 0) {
      delete settings.extraKnownMarketplaces;
    }
  }
  if (settings.env) {
    for (const envKey of settingsDescriptor.envKeys ?? []) {
      delete settings.env[envKey];
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }
  if (Object.keys(settings).length === 0 && settingsDescriptor.fileCreatedByUs) {
    await rm(settingsPath, { force: true });
    removed.push(settingsDescriptor.relPath);
  } else {
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    removed.push(`${settingsDescriptor.relPath} (abilitazione plugin rimossa)`);
  }
}

async function removeClaudeBlock(projectRoot, claudeDescriptor, removed) {
  if (!claudeDescriptor || !claudeDescriptor.blockAdded) {
    return;
  }
  const claudePath = join(projectRoot, claudeDescriptor.relPath);
  if (!(await pathExists(claudePath))) {
    return;
  }
  const content = await readFile(claudePath, 'utf8');
  const blockPattern = new RegExp(`\\n?${escapeForRegExp(MARKER_START)}[\\s\\S]*?${escapeForRegExp(MARKER_END)}\\n?`);
  const cleaned = content.replace(blockPattern, '\n');
  const stripped = cleaned.replace(/^#\s*CLAUDE\.md\s*/i, '').trim();
  if (claudeDescriptor.fileCreatedByUs && stripped === '') {
    await rm(claudePath, { force: true });
    removed.push(claudeDescriptor.relPath);
  } else {
    await writeFile(claudePath, `${cleaned.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')}`, 'utf8');
    removed.push(`${claudeDescriptor.relPath} (blocco AI-Dev Flow rimosso)`);
  }
}

async function removeCreatedFile(projectRoot, entry, purge, removed, kept) {
  const targetPath = join(projectRoot, entry.relPath);
  if (!(await pathExists(targetPath))) {
    return;
  }
  const currentHash = await hashOfFile(targetPath);
  if (purge || !entry.sha256 || currentHash === entry.sha256) {
    await rm(targetPath, { force: true });
    removed.push(entry.relPath);
  } else {
    kept.push(entry.relPath);
  }
}

async function removeEmptyDirectories(projectRoot, relativeDirectories) {
  const sortedByDepthDescending = [...relativeDirectories].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const relPath of sortedByDepthDescending) {
    const directoryPath = join(projectRoot, relPath);
    if (!(await pathExists(directoryPath))) {
      continue;
    }
    try {
      const entries = await readdir(directoryPath);
      if (entries.length === 0) {
        await rm(directoryPath, { recursive: false, force: true });
      }
    } catch {
      // directory non vuota o non rimovibile: la lascio
    }
  }
}

run().catch((error) => {
  console.error('Errore durante la disinstallazione:', error.message);
  process.exitCode = 1;
});
