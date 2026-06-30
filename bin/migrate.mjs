#!/usr/bin/env node
// AI-Dev Flow — migrazione PER-PROGETTO del kit.
//
// Porta gli artefatti per-progetto (flow.config.json, settings env, ecc.) dalla versione installata
// (flow.lock.json.kitVersion) alla versione corrente del kit (VERSION), applicando in ordine le
// migrazioni in migrations/ che trasformano i dati dal vecchio al nuovo formato. Le versioni senza
// migrazione sono semplici bump (nessun cambio di formato).
//
// Uso: node migrate.mjs [--project <path>] [--kit <path>]
// Proprietà: idempotente (se già alla versione corrente, no-op) e transazionale (rollback a errore).

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const KIT_ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') {
      parsed.projectRoot = argv[++index];
    } else if (argv[index] === '--kit') {
      parsed.kitRoot = argv[++index];
    } else if (argv[index] === '--help' || argv[index] === '-h') {
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

function parseSemver(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) < (b[index] ?? 0) ? -1 : 1;
    }
  }
  return 0;
}

async function discoverMigrations(kitRoot) {
  const migrationsDir = join(kitRoot, 'migrations');
  if (!(await pathExists(migrationsDir))) {
    return [];
  }
  const fileNames = (await readdir(migrationsDir)).filter((name) => /^\d+\.\d+\.\d+-to-\d+\.\d+\.\d+\.mjs$/.test(name));
  return fileNames
    .map((name) => {
      const [from, to] = name.replace(/\.mjs$/, '').split('-to-');
      return { from, to, path: join(migrationsDir, name) };
    })
    .sort((left, right) => compareSemver(left.to, right.to));
}

class MigrationContext {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.backups = new Map();
  }

  async readText(relativePath) {
    const absolutePath = join(this.projectRoot, relativePath);
    return (await pathExists(absolutePath)) ? readFile(absolutePath, 'utf8') : null;
  }

  async writeText(relativePath, content) {
    const absolutePath = join(this.projectRoot, relativePath);
    if (!this.backups.has(absolutePath)) {
      this.backups.set(absolutePath, (await pathExists(absolutePath)) ? await readFile(absolutePath, 'utf8') : null);
    }
    await writeFile(absolutePath, content, 'utf8');
  }

  async readJson(relativePath) {
    const text = await this.readText(relativePath);
    return text === null ? null : JSON.parse(text);
  }

  async writeJson(relativePath, value) {
    await this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  log(message) {
    console.log(`    ${message}`);
  }

  async rollback() {
    for (const [absolutePath, originalContent] of this.backups) {
      if (originalContent === null) {
        await import('node:fs/promises').then(({ rm }) => rm(absolutePath, { force: true }));
      } else {
        await writeFile(absolutePath, originalContent, 'utf8');
      }
    }
  }
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Uso: node migrate.mjs [--project <path>] [--kit <path>]');
    return;
  }

  const kitRoot = resolve(args.kitRoot ?? KIT_ROOT_DEFAULT);
  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  const currentVersion = (await readFile(join(kitRoot, 'VERSION'), 'utf8')).trim();

  const lockPath = join(projectRoot, 'flow.lock.json');
  if (!(await pathExists(lockPath))) {
    console.log('Nessuna installazione AI-Dev Flow qui (flow.lock.json assente). Esegui prima `install`.');
    return;
  }
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const installedVersion = lock.kitVersion;

  if (compareSemver(installedVersion, currentVersion) === 0) {
    console.log(`Già aggiornato (kitVersion ${currentVersion}). Niente da migrare.`);
    return;
  }
  if (compareSemver(installedVersion, currentVersion) > 0) {
    console.log(`La versione installata (${installedVersion}) è più recente del kit (${currentVersion}). Non eseguo downgrade.`);
    return;
  }

  console.log(`Migrazione: ${installedVersion} → ${currentVersion}`);
  const migrations = (await discoverMigrations(kitRoot))
    .filter((migration) => compareSemver(migration.to, installedVersion) > 0 && compareSemver(migration.to, currentVersion) <= 0);

  const context = new MigrationContext(projectRoot);
  if (!context.backups.has(lockPath)) {
    context.backups.set(lockPath, await readFile(lockPath, 'utf8'));
  }

  try {
    for (const migration of migrations) {
      console.log(`  applico ${migration.from} → ${migration.to}`);
      const migrationModule = await import(pathToFileURL(migration.path).href);
      const migrate = migrationModule.default;
      await migrate(context);
    }
    if (migrations.length === 0) {
      console.log('  nessuna migrazione di formato necessaria: solo bump di versione.');
    }
    lock.kitVersion = currentVersion;
    lock.processVersion = currentVersion;
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    console.log(`Migrazione completata. flow.lock.json ora a ${currentVersion}.`);
  } catch (error) {
    console.error('Errore durante la migrazione, eseguo il rollback:', error.message);
    await context.rollback();
    console.error('Rollback completato: il progetto è tornato allo stato precedente.');
    process.exitCode = 1;
  }
}

run();
