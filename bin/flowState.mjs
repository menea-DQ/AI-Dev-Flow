#!/usr/bin/env node
// AI-Dev Flow — stato PER-TASK (libreria + CLI).
//
// Lo stato è il registro dei FATTI di un task in lavorazione: fase corrente, gate approvati,
// artefatti prodotti (spec, branch, snapshot, verifiche, doc, ticket) e ogni skip/deroga esplicita.
// NON è un workflow engine: non esegue nulla. La logica vive negli hook e nelle skill; qui ci sono
// solo i fatti, persistiti e auditabili. Regole di design (vedi gap analysis, GAP-01):
//   • registro di fatti, non motore;  • schema minimo e versionato (stateVersion);
//   • unico punto di lettura/scrittura (questa libreria);  • coperto dal migrate;
//   • sacrificabile: punta agli artefatti, non li contiene (si può ricostruire).
//
// Persistenza: .ai-dev/tasks/<task-id>/state.json + puntatore .ai-dev/tasks/ACTIVE.
//
// Uso come CLI (è così che l'agente registra i fatti; ogni comando aggiorna anche il log):
//   node flowState.mjs start --task <id> [--type cr|bug] [--title <t>] [--connector <n>] [--reference <url-o-id>]
//   node flowState.mjs next            ← IL SEQUENCER: legge i fatti e dice il prossimo passo (deterministico)
//   node flowState.mjs abort --reason <r>   ← abbandono con compensazioni (chiude lo stato, elenca cosa ripulire)
//   node flowState.mjs active | show | close | clear-active
//   node flowState.mjs set-phase <intake|spec|plan|implementation|quality|documentation|delivery|done>
//   node flowState.mjs approve-gate <spec|plan|diff>
//   node flowState.mjs record-spec --path <relPath>
//   node flowState.mjs set-branch --name <branch> --base <base>
//   node flowState.mjs record-manifest      ← manifest "prima" dei progetti SENZA git (inventario del GATE 3)
//   node flowState.mjs diff-manifest        ← confronto manifest vs stato corrente: nuovi/modificati/rimossi
//   node flowState.mjs record-snapshot --status <captured|skipped> [--reason <r>]
//   node flowState.mjs record-verification --status <done|skipped> [--tests <csv>] [--reason <r>]
//   node flowState.mjs record-doc-review --status <done|none-impacted|skipped> [--docs <csv>] [--reason <r>]
//   node flowState.mjs record-changelog
//   node flowState.mjs record-ticket-update --status <stato>
//   node flowState.mjs record-pr --url <url>
//   node flowState.mjs record-override --gate <nome> --reason <r>
// Tutti i comandi accettano [--project <path>] (default: cwd) e [--task <id>] (default: ACTIVE).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFlowConfig, matchesAnyPattern } from '../lib/common.mjs';

export const STATE_VERSION = 1;
export const PHASES = ['intake', 'spec', 'plan', 'implementation', 'quality', 'documentation', 'delivery', 'done', 'aborted'];
export const GATES = ['spec', 'plan', 'diff'];

const TASKS_DIRECTORY = join('.ai-dev', 'tasks');

export function tasksDirectory(projectRoot) {
  return join(projectRoot, TASKS_DIRECTORY);
}

export function activePointerPath(projectRoot) {
  return join(tasksDirectory(projectRoot), 'ACTIVE');
}

export function statePath(projectRoot, taskId) {
  return join(tasksDirectory(projectRoot), sanitizeTaskId(taskId), 'state.json');
}

export function sanitizeTaskId(taskId) {
  return String(taskId).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function activeTaskId(projectRoot) {
  const pointer = activePointerPath(projectRoot);
  if (!existsSync(pointer)) {
    return null;
  }
  const taskId = readFileSync(pointer, 'utf8').trim();
  return taskId === '' ? null : taskId;
}

export function loadTaskState(projectRoot, taskId) {
  const target = statePath(projectRoot, taskId);
  if (!existsSync(target)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

export function loadActiveState(projectRoot) {
  const taskId = activeTaskId(projectRoot);
  return taskId ? loadTaskState(projectRoot, taskId) : null;
}

export function saveTaskState(projectRoot, state) {
  state.updatedAt = new Date().toISOString();
  const target = statePath(projectRoot, state.task.id);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return target;
}

export function appendLog(state, event) {
  state.log ??= [];
  state.log.push({ at: new Date().toISOString(), event });
}

// Hash del lavoro non committato: identifica ESATTAMENTE il diff verificato. Se dopo una verifica
// il codice cambia ancora, l'hash cambia e il gate di verifica si ri-arma (GAP-05).
export function currentDiffHash(projectRoot) {
  try {
    const status = execSync('git status --porcelain --untracked-files=all', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const diff = execSync('git diff HEAD', { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return createHash('sha256').update(status).update(diff).digest('hex');
  } catch {
    return null;
  }
}

export function currentGitBranch(projectRoot) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function hasOverride(state, gateName) {
  return (state?.overrides ?? []).some((entry) => entry.gate === gateName);
}

// ————— Manifest "prima" (progetti SENZA git) —————
// Senza git il GATE 3 non ha un diff: l'inventario di ciò che il task ha toccato va costruito per
// CONFRONTO con uno stato registrato PRIMA del lavoro, non con una `find -newermt` a timestamp
// indovinato (che sbaglia il taglio e pesca i file del task precedente). Stessa logica dello
// snapshot "before" sui dati: la finestra per catturarlo è mentre il codice è ancora intatto.

const MANIFEST_FILE = 'manifest-before.txt';

// Esclusioni di default: ciò che non è "lavoro del task" (dipendenze, build, metadati, stato del
// flusso stesso). Sovrascrivibili con branching.manifestExclude in flow.config.json.
export const MANIFEST_DEFAULT_EXCLUDE = [
  '.git/**',
  'node_modules/**',
  '.ai-dev/tasks/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '**/.DS_Store',
  '**/*.log',
];

export function manifestPath(projectRoot, taskId) {
  return join(tasksDirectory(projectRoot), sanitizeTaskId(taskId), MANIFEST_FILE);
}

export function manifestSettings(projectRoot) {
  const branching = readFlowConfig(projectRoot).branching ?? {};
  return {
    paths: Array.isArray(branching.manifestPaths) && branching.manifestPaths.length > 0 ? branching.manifestPaths : ['.'],
    exclude: Array.isArray(branching.manifestExclude) ? branching.manifestExclude : MANIFEST_DEFAULT_EXCLUDE,
  };
}

function toPosix(relativePath) {
  return sep === '/' ? relativePath : relativePath.split(sep).join('/');
}

function toRelativeProjectPath(projectRoot, absolutePath) {
  return toPosix(relative(projectRoot, absolutePath));
}

// Raccoglie {percorso relativo → hash del contenuto} sotto le directory dichiarate.
export function collectManifest(projectRoot, settings) {
  const { paths, exclude } = settings;
  const entries = new Map();

  const visit = (absolutePath) => {
    const relativePath = toPosix(relative(projectRoot, absolutePath));
    if (relativePath !== '' && matchesAnyPattern(relativePath, exclude)) {
      return;
    }
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      return; // link rotto o file svanito durante la scansione: non è un fatto del task
    }
    if (stats.isDirectory()) {
      for (const child of readdirSync(absolutePath)) {
        visit(join(absolutePath, child));
      }
      return;
    }
    if (!stats.isFile()) {
      return;
    }
    try {
      entries.set(relativePath, createHash('sha256').update(readFileSync(absolutePath)).digest('hex'));
    } catch {
      // illeggibile: meglio ometterlo che far fallire l'inventario
    }
  };

  for (const declaredPath of paths) {
    const absolutePath = join(projectRoot, declaredPath);
    if (existsSync(absolutePath)) {
      visit(absolutePath);
    }
  }
  return entries;
}

export function serializeManifest(entries) {
  return [...entries.keys()].sort().map((relativePath) => `${entries.get(relativePath)}  ${relativePath}`).join('\n');
}

export function parseManifest(text) {
  const entries = new Map();
  for (const line of String(text).split('\n')) {
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    const separatorIndex = line.indexOf('  ');
    if (separatorIndex > 0) {
      entries.set(line.slice(separatorIndex + 2), line.slice(0, separatorIndex));
    }
  }
  return entries;
}

// L'inventario del GATE 3: differenza fra il manifest registrato e lo stato corrente del progetto.
export function compareManifest(before, after) {
  const added = [...after.keys()].filter((path) => !before.has(path)).sort();
  const removed = [...before.keys()].filter((path) => !after.has(path)).sort();
  const modified = [...after.keys()].filter((path) => before.has(path) && before.get(path) !== after.get(path)).sort();
  return { added, modified, removed };
}

// ————— Il sequencer deterministico (comando `next`) —————
// Il "qual è il prossimo passo" NON è una decisione dell'LLM: è una funzione dei FATTI registrati.
// Prima condizione non soddisfatta = prossimo passo. L'orchestratore esegue, registra, richiama.
export function nextStep(state, projectRoot) {
  const cli = 'node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs"';
  const conn = state.task?.connector ?? '<ticketing>';
  const ref = state.task?.reference ?? state.task?.id;

  if (state.phase === 'done') {
    return { phase: 'done', action: 'Task già chiuso. Nulla da fare.', record: null };
  }
  if (state.phase === 'aborted') {
    return { phase: 'aborted', action: 'Task abbandonato. Nulla da fare (lo stato resta come audit trail).', record: null };
  }
  if (state.phase === 'intake') {
    return {
      phase: 'F0 · Intake',
      action: 'Completa l\'intake: contract-check dei connettori, lettura del ticket via connettore, normalizzazione col sub-agent intake (niente codebase).',
      record: `${cli} set-phase spec`,
    };
  }
  if (!state.gates?.spec) {
    return {
      phase: 'F1 · Specifica',
      action: 'Produci/raffina la specifica col sub-agent spec-author (architecture doc prima del codice, impact analysis, domande sui buchi) e presentala al GATE UMANO 1.',
      record: `ad approvazione dell'utente: ${cli} approve-gate spec`,
    };
  }
  if (!state.spec?.path) {
    return {
      phase: 'F1 · Specifica (chiusura)',
      action: 'Salva la specifica approvata nello Spec Store (flow.config.specStore.path).',
      record: `${cli} record-spec --path <file>`,
    };
  }
  if ((state.ticketUpdates ?? []).length === 0) {
    return {
      phase: 'F1 · Specifica (chiusura)',
      action: `Commenta il task nel ticketing col riferimento alla spec: node "\${CLAUDE_PLUGIN_ROOT}/connectors/${conn}.mjs" --comment "${ref}" "Spec approvata: <path>"`,
      record: `${cli} record-ticket-update --status "spec-approvata"`,
    };
  }
  if (!state.gates?.plan) {
    return {
      phase: 'F2 · Piano',
      action: 'Proponi il PIANO (approccio, file toccati, rischi) e presentalo al GATE UMANO 2.',
      record: `ad approvazione dell'utente: ${cli} approve-gate plan`,
    };
  }
  if (!state.branch?.name && !hasOverride(state, 'branch')) {
    return {
      phase: 'F2 · Branch',
      action: 'Crea il branch di lavoro PRIMA di ogni commit: chiedi all\'utente il branch base e proponi <fix|feat>/<nome-breve-esplicativo> (nome custom ammesso). Poi: git checkout -b <branch>.'
        + (currentGitBranch(projectRoot) === null ? ' — ATTENZIONE: qui non c\'è un repository git. Se il progetto non ne ha uno, la deroga va registrata: record-override --gate branch --reason "<motivo dell\'utente>".' : ''),
      record: `${cli} set-branch --name <branch> --base <base>`,
    };
  }
  // Senza git il GATE 3 non ha un diff: l'inventario si costruisce per confronto con un manifest
  // catturato da codice ancora intatto (prima anche dei test del test-author).
  const withoutGit = hasOverride(state, 'branch') || currentGitBranch(projectRoot) === null;
  if (withoutGit && !state.manifest) {
    return {
      phase: 'F2 · Manifest "prima" (progetto senza git)',
      action: 'Registra ORA il manifest dello stato "prima", mentre il codice è ancora intatto: è ciò che rende l\'inventario del GATE 3 un CONFRONTO invece di una find con un timestamp indovinato.',
      record: `${cli} record-manifest`,
    };
  }
  if (!state.testsAuthored && !hasOverride(state, 'fast-path')) {
    return {
      phase: 'F2 · Test (test-author)',
      action: 'Lancia il sub-agent test-author passandogli SOLO la spec: deriva i test dal contratto e li COMMITTA prima del codice (ramo BUG: il red-test).',
      record: `${cli} record-tests-authored`,
    };
  }
  if (!state.gates?.diff) {
    return {
      phase: 'F2 · Implementazione',
      action: `Implementa (impl-runbook: convenzioni dichiarate, contesto minimo, test intoccabili) e presenta ${withoutGit ? 'l\'inventario dei file toccati al GATE UMANO 3: ottienilo con `diff-manifest` (confronto col manifest "prima"), non con una find a timestamp' : 'il diff al GATE UMANO 3'}.`,
      record: `ad approvazione dell'utente: ${cli} approve-gate diff`,
    };
  }
  const diffHash = currentDiffHash(projectRoot);
  if (!state.verification || state.verification.diffHash !== diffHash) {
    return {
      phase: 'F3 · Qualità',
      action: `Seleziona i test dal test-playbook (test-selector) e falli eseguire al sub-agent test-runner${state.verification ? ' — il codice è CAMBIATO dopo l\'ultima verifica: va rifatta' : ''}. Rossi → si torna all'implementazione.`,
      record: `${cli} record-verification --status done --tests "<nomi>"`,
    };
  }
  if (!state.docReview) {
    return {
      phase: 'F4 · Documentazione',
      action: 'Lancia il sub-agent doc-author (spec + diff + registro flow.config.documentation.docs + architecture doc): aggiorna i documenti impattati o dichiara "nessun impatto, perché…".',
      record: `${cli} record-doc-review --status done|none-impacted [--docs "<csv>"] [--reason "<r>"]`,
    };
  }
  if (!state.changelog) {
    return {
      phase: 'F4 · Changelog',
      action: 'Scrivi la voce di changelog (la scelta fatta e il perché).',
      record: `${cli} record-changelog`,
    };
  }
  if (!state.pr) {
    return {
      phase: 'F5 · Consegna (PR)',
      action: `Proponi la PR da ${state.branch.name} verso ${state.branch.base} (titolo dalla spec, corpo con link a spec/changelog/ticket).`,
      record: `${cli} record-pr --url <url>`,
    };
  }
  const prTime = state.pr?.at ?? '';
  const finalTicketUpdate = (state.ticketUpdates ?? []).some((u) => u.at > prTime);
  if (!finalTicketUpdate) {
    return {
      phase: 'F5 · Consegna (ticket)',
      action: `Aggiorna lo stato del ticket (chiedi all'utente: Review o Done): node "\${CLAUDE_PLUGIN_ROOT}/connectors/${conn}.mjs" --update-status "${ref}" "<stato>"`,
      record: `${cli} record-ticket-update --status "<stato>"`,
    };
  }
  return {
    phase: 'F5 · Chiusura',
    action: 'Tutto fatto: chiudi il task.',
    record: `${cli} close`,
  };
}

export function newTaskState({ id, type, title, connector, reference }) {
  const now = new Date().toISOString();
  return {
    stateVersion: STATE_VERSION,
    task: { id: sanitizeTaskId(id), type: type ?? null, title: title ?? null, connector: connector ?? null, reference: reference ?? null },
    phase: 'intake',
    startedAt: now,
    updatedAt: now,
    gates: {},
    spec: null,
    branch: null,
    testsAuthored: null,
    manifest: null,
    snapshot: null,
    verification: null,
    aborted: null,
    docReview: null,
    changelog: null,
    ticketUpdates: [],
    pr: null,
    overrides: [],
    log: [{ at: now, event: 'task avviato' }],
  };
}

// ————— CLI —————

function parseCliArguments(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      options[token.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
    } else {
      positional.push(token);
    }
  }
  return { positional, options };
}

function failCli(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireOption(options, name) {
  if (options[name] === undefined || options[name] === true) {
    failCli(`Opzione obbligatoria mancante: --${name}`);
  }
  return options[name];
}

function loadStateOrFail(projectRoot, options) {
  const taskId = options.task ?? activeTaskId(projectRoot);
  if (!taskId) {
    failCli('Nessun task attivo (.ai-dev/tasks/ACTIVE assente) e nessun --task indicato. Avvia con: flowState.mjs start --task <id>');
  }
  const state = loadTaskState(projectRoot, taskId);
  if (!state) {
    failCli(`Nessuno stato per il task "${taskId}". Avvia con: flowState.mjs start --task ${taskId}`);
  }
  return state;
}

function runCli() {
  const { positional, options } = parseCliArguments(process.argv.slice(2));
  const command = positional[0];
  const projectRoot = options.project ?? process.cwd();
  if (!command) {
    failCli('Comando mancante. Vedi l\'intestazione di flowState.mjs per l\'elenco.');
  }

  if (command === 'start') {
    const id = requireOption(options, 'task');
    const existing = loadTaskState(projectRoot, id);
    const state = existing ?? newTaskState({ id, type: options.type, title: options.title, connector: options.connector, reference: options.reference });
    if (existing) {
      appendLog(state, 'task ripreso (start su stato esistente)');
    }
    saveTaskState(projectRoot, state);
    mkdirSync(tasksDirectory(projectRoot), { recursive: true });
    writeFileSync(activePointerPath(projectRoot), `${sanitizeTaskId(id)}\n`, 'utf8');
    console.log(`${existing ? 'Ripreso' : 'Avviato'} task "${sanitizeTaskId(id)}" (fase: ${state.phase}). ACTIVE aggiornato.`);
    return;
  }

  if (command === 'active') {
    const taskId = activeTaskId(projectRoot);
    console.log(taskId ?? '');
    return;
  }

  if (command === 'clear-active') {
    rmSync(activePointerPath(projectRoot), { force: true });
    console.log('Puntatore ACTIVE rimosso (nessun task attivo).');
    return;
  }

  const state = loadStateOrFail(projectRoot, options);

  switch (command) {
    case 'show': {
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    case 'next': {
      const step = nextStep(state, projectRoot);
      console.log(`Task "${state.task.id}" · prossimo passo → ${step.phase}`);
      console.log(`AZIONE: ${step.action}`);
      if (step.record) {
        console.log(`POI REGISTRA: ${step.record}`);
      }
      const derogated = (state.overrides ?? []).map((o) => o.gate);
      if (derogated.length > 0) {
        console.log(`(deroghe attive: ${derogated.join(', ')})`);
      }
      return;
    }
    case 'record-manifest': {
      const settings = manifestSettings(projectRoot);
      const entries = collectManifest(projectRoot, settings);
      const target = manifestPath(projectRoot, state.task.id);
      const header = [
        `# AI-Dev Flow — manifest "prima" del task ${state.task.id}`,
        `# catturato: ${new Date().toISOString()}`,
        `# radici: ${settings.paths.join(', ')}`,
        `# esclusioni: ${settings.exclude.join(', ')}`,
        '# formato: <sha256>  <percorso relativo>',
      ].join('\n');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${header}\n${serializeManifest(entries)}\n`, 'utf8');
      state.manifest = {
        path: toRelativeProjectPath(projectRoot, target),
        files: entries.size,
        paths: settings.paths,
        at: new Date().toISOString(),
      };
      appendLog(state, `manifest "prima" catturato: ${entries.size} file (${state.manifest.path})`);
      saveTaskState(projectRoot, state);
      console.log(`Manifest "prima" registrato: ${entries.size} file sotto ${settings.paths.join(', ')} → ${state.manifest.path}`);
      console.log('Al GATE 3 ottieni l\'inventario con: flowState.mjs diff-manifest');
      return;
    }
    case 'diff-manifest': {
      if (!state.manifest) {
        failCli('Nessun manifest "prima" registrato per questo task. Catturalo con: flowState.mjs record-manifest (va fatto da codice intatto: a lavoro iniziato la finestra è persa).');
      }
      const target = manifestPath(projectRoot, state.task.id);
      if (!existsSync(target)) {
        failCli(`Manifest registrato nello stato ma file assente: ${target}. L'inventario per confronto non è ricostruibile.`);
      }
      const before = parseManifest(readFileSync(target, 'utf8'));
      const after = collectManifest(projectRoot, manifestSettings(projectRoot));
      const { added, modified, removed } = compareManifest(before, after);
      console.log(`Inventario per confronto col manifest "prima" (${state.manifest.at}):`);
      console.log(`  nuovi (${added.length}):`);
      added.forEach((path) => console.log(`    + ${path}`));
      console.log(`  modificati (${modified.length}):`);
      modified.forEach((path) => console.log(`    ~ ${path}`));
      console.log(`  rimossi (${removed.length}):`);
      removed.forEach((path) => console.log(`    - ${path}`));
      if (added.length + modified.length + removed.length === 0) {
        console.log('  (nessuna differenza: il progetto è identico al manifest "prima")');
      }
      return;
    }
    case 'record-tests-authored': {
      state.testsAuthored = { at: new Date().toISOString() };
      appendLog(state, 'test scritti e committati dal test-author (prima del codice)');
      break;
    }
    case 'abort': {
      const reason = requireOption(options, 'reason');
      state.phase = 'aborted';
      state.aborted = { reason, at: new Date().toISOString() };
      appendLog(state, `task ABBANDONATO: ${reason}`);
      saveTaskState(projectRoot, state);
      rmSync(activePointerPath(projectRoot), { force: true });
      console.log(`Task "${state.task.id}" abbandonato (motivo registrato). ACTIVE rimosso; lo stato resta come audit trail.`);
      console.log('COMPENSAZIONI da proporre all\'utente:');
      if (state.branch?.name) {
        console.log(`  • eliminare il branch di lavoro: git branch -D ${state.branch.name} (le modifiche restano solo nella sua storia)`);
      }
      if ((state.ticketUpdates ?? []).length > 0 && state.task?.connector) {
        console.log(`  • annotare il ticket: node "\${CLAUDE_PLUGIN_ROOT}/connectors/${state.task.connector}.mjs" --comment "${state.task.reference ?? state.task.id}" "Task abbandonato: ${reason}"`);
      }
      console.log('  • se era stato catturato uno snapshot "before", può essere rimosso.');
      if (state.manifest?.path) {
        console.log(`  • il manifest "prima" (${state.manifest.path}) non serve più: può essere rimosso.`);
      }
      return;
    }
    case 'set-phase': {
      const phase = positional[1];
      if (!PHASES.includes(phase)) {
        failCli(`Fase non valida: "${phase}". Valide: ${PHASES.join(', ')}`);
      }
      state.phase = phase;
      appendLog(state, `fase → ${phase}`);
      break;
    }
    case 'approve-gate': {
      const gate = positional[1];
      if (!GATES.includes(gate)) {
        failCli(`Gate non valido: "${gate}". Validi: ${GATES.join(', ')}`);
      }
      state.gates[gate] = { approvedAt: new Date().toISOString() };
      appendLog(state, `GATE UMANO approvato: ${gate}`);
      break;
    }
    case 'record-spec': {
      state.spec = { path: requireOption(options, 'path'), savedAt: new Date().toISOString() };
      appendLog(state, `spec salvata: ${state.spec.path}`);
      break;
    }
    case 'set-branch': {
      state.branch = { name: requireOption(options, 'name'), base: requireOption(options, 'base'), createdAt: new Date().toISOString() };
      appendLog(state, `branch di lavoro: ${state.branch.name} (da ${state.branch.base})`);
      break;
    }
    case 'record-snapshot': {
      const status = requireOption(options, 'status');
      if (!['captured', 'skipped'].includes(status)) {
        failCli('record-snapshot: --status deve essere captured|skipped');
      }
      if (status === 'skipped' && !options.reason) {
        failCli('record-snapshot: lo skip richiede --reason (le deroghe sono auditabili).');
      }
      state.snapshot = { status, reason: options.reason ?? null, at: new Date().toISOString() };
      appendLog(state, `snapshot "before": ${status}${options.reason ? ` (${options.reason})` : ''}`);
      break;
    }
    case 'record-verification': {
      const status = requireOption(options, 'status');
      if (!['done', 'skipped'].includes(status)) {
        failCli('record-verification: --status deve essere done|skipped');
      }
      if (status === 'skipped' && !options.reason) {
        failCli('record-verification: lo skip richiede --reason (le deroghe sono auditabili).');
      }
      state.verification = {
        status,
        tests: options.tests ? String(options.tests).split(',').map((name) => name.trim()).filter(Boolean) : [],
        reason: options.reason ?? null,
        diffHash: currentDiffHash(projectRoot),
        at: new Date().toISOString(),
      };
      appendLog(state, `verifica test: ${status}${options.reason ? ` (${options.reason})` : ''}`);
      break;
    }
    case 'record-doc-review': {
      const status = requireOption(options, 'status');
      if (!['done', 'none-impacted', 'skipped'].includes(status)) {
        failCli('record-doc-review: --status deve essere done|none-impacted|skipped');
      }
      if (status !== 'done' && !options.reason) {
        failCli('record-doc-review: none-impacted e skipped richiedono --reason (motivazione auditabile).');
      }
      state.docReview = {
        status,
        docs: options.docs ? String(options.docs).split(',').map((name) => name.trim()).filter(Boolean) : [],
        reason: options.reason ?? null,
        at: new Date().toISOString(),
      };
      appendLog(state, `doc-review: ${status}${options.reason ? ` (${options.reason})` : ''}`);
      break;
    }
    case 'record-changelog': {
      state.changelog = { updatedAt: new Date().toISOString() };
      appendLog(state, 'changelog aggiornato');
      break;
    }
    case 'record-ticket-update': {
      const status = requireOption(options, 'status');
      state.ticketUpdates.push({ status, at: new Date().toISOString() });
      appendLog(state, `ticket aggiornato: ${status}`);
      break;
    }
    case 'record-pr': {
      state.pr = { url: requireOption(options, 'url'), at: new Date().toISOString() };
      appendLog(state, `PR aperta: ${state.pr.url}`);
      break;
    }
    case 'record-override': {
      const gate = requireOption(options, 'gate');
      const reason = requireOption(options, 'reason');
      state.overrides.push({ gate, reason, at: new Date().toISOString() });
      appendLog(state, `DEROGA umana sul gate "${gate}": ${reason}`);
      break;
    }
    case 'close': {
      state.phase = 'done';
      appendLog(state, 'task chiuso');
      saveTaskState(projectRoot, state);
      rmSync(activePointerPath(projectRoot), { force: true });
      console.log(`Task "${state.task.id}" chiuso. ACTIVE rimosso.`);
      return;
    }
    default:
      failCli(`Comando sconosciuto: "${command}". Vedi l'intestazione di flowState.mjs.`);
  }

  saveTaskState(projectRoot, state);
  console.log(`OK — stato del task "${state.task.id}" aggiornato (${command}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
