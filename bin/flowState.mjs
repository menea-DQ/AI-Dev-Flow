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
//   node flowState.mjs next            ← IL SEQUENCER: legge i fatti e dice il prossimo passo (deterministico).
//                                        Registra anche nel log l'INIZIO-AZIONE (`sequencer → <passo>`, dedup
//                                        sui richiami dello stesso passo): i fatti timestampano i completamenti,
//                                        e senza l'altro estremo gli intervalli fra i gate non distinguono
//                                        il tempo macchina dall'attesa umana.
//   node flowState.mjs report [--otel] ← durate per passo dal log (inizi-azione + fatti): dove è andato il tempo;
//                                        con --otel le esporta anche all'endpoint OTLP di flow.config.telemetry
//   node flowState.mjs abort --reason <r>   ← abbandono con compensazioni (chiude lo stato, elenca cosa ripulire)
//   node flowState.mjs active | show | close | clear-active
//   node flowState.mjs set-phase <intake|spec|plan|implementation|quality|documentation|delivery|done>
//   node flowState.mjs approve-gate <spec|plan|diff>
//   node flowState.mjs record-spec --path <relPath>
//   node flowState.mjs set-branch --name <branch> --base <base>
//   node flowState.mjs record-manifest      ← manifest "prima" dei progetti SENZA git (inventario del GATE 3)
//   node flowState.mjs diff-manifest        ← confronto manifest vs stato corrente: nuovi/modificati/rimossi
//   node flowState.mjs record-snapshot --status <captured|skipped> [--reason <r>]
//   node flowState.mjs record-verification --status <done|failed|skipped> [--tests <csv>] [--reason <r>]
//   node flowState.mjs record-doc-review --status <done|none-impacted|skipped> [--docs <csv>] [--reason <r>]
//   node flowState.mjs record-changelog
//   node flowState.mjs record-ticket-update --status <stato>
//   node flowState.mjs record-pr --url <url>
//   node flowState.mjs record-override --gate <nome> --reason <r>
// Tutti i comandi accettano [--project <path>] (default: cwd) e [--task <id>] (default: ACTIVE).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, relative, sep, basename, resolve } from 'node:path';
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

// Percorsi relativi dei file che combaciano coi pattern, SENZA leggerne il contenuto: la selezione
// va fatta prima di hashare (e prima del filtro gitignore della verifica). `include` (opzionale):
// se presente, restano SOLO i file che combaciano — le directory si attraversano comunque
// (un pattern di file non combacia mai con una directory).
export function collectMatchingPaths(projectRoot, settings) {
  const { paths = ['.'], exclude, include } = settings;
  const found = [];

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
    if (include && !matchesAnyPattern(relativePath, include)) {
      return;
    }
    found.push(relativePath);
  };

  for (const declaredPath of paths) {
    const absolutePath = join(projectRoot, declaredPath);
    if (existsSync(absolutePath)) {
      visit(absolutePath);
    }
  }
  return found.sort();
}

// Raccoglie {percorso relativo → hash del contenuto} sotto le directory dichiarate.
export function collectManifest(projectRoot, settings) {
  const entries = new Map();
  for (const relativePath of collectMatchingPaths(projectRoot, settings)) {
    try {
      entries.set(relativePath, createHash('sha256').update(readFileSync(join(projectRoot, relativePath))).digest('hex'));
    } catch {
      // illeggibile: meglio ometterlo che far fallire l'inventario
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

// ————— Hash di verifica (perimetro del test-playbook) —————
// La verifica di Fase 3 vale per lo STATO DEL CODICE che i test coprono: l'hash si calcola sul
// CONTENUTO dei file che ricadono nei pathPatterns del test-playbook, non sull'intero diff git.
// Perché: l'hash globale (status+diff) si ri-armava a ogni scrittura del flusso stesso — doc,
// changelog, commit della spec nello Spec Store — forzando ri-esecuzioni della suite senza che il
// codice sotto test fosse cambiato (misurato sul campo: 7 task su 13 con ri-verifiche spurie).
// Content-based ha due corollari voluti: un COMMIT non ri-arma nulla (il contenuto non cambia),
// e il gate funziona identico nei progetti SENZA git. Se il codice coperto cambia davvero dopo
// una verifica, l'hash cambia e il gate si ri-arma da solo (GAP-05, semantica invariata).
// Esclusioni della verifica: oltre a quelle del manifest, gli artefatti del flusso (.ai-dev) e i
// SOTTOPRODOTTI volatili comuni (build cache, report dei test). Sono scritti da build e test: se
// entrassero nell'hash sarebbero i TEST STESSI a ri-armare il gate (misurato sul campo: con un
// playbook `**/*`, 2.180 dei 2.601 file hashati stavano in .next/). Nei progetti git il filtro
// vero è il .gitignore (vedi gitIgnoredPaths); questa lista è la cintura per i progetti senza git.
export const VERIFICATION_EXCLUDE = [
  ...MANIFEST_DEFAULT_EXCLUDE,
  '.ai-dev/**',
  '.next/**', '.nuxt/**', '.svelte-kit/**', '.turbo/**', '.cache/**', '.parcel-cache/**',
  '.vercel/**', '.serverless/**',
  'playwright-report/**', 'test-results/**', '**/*.tsbuildinfo',
  '**/__pycache__/**', '.pytest_cache/**', '.venv/**', 'venv/**', '.tox/**', '.gradle/**',
];

export function playbookPatterns(projectRoot) {
  const playbook = readFlowConfig(projectRoot).testPlaybook ?? {};
  return Object.values(playbook).flatMap((entry) => (Array.isArray(entry?.pathPatterns) ? entry.pathPatterns : []));
}

// I documenti GOVERNATI dal flusso — registro documentazione, changelog, spec store, architecture
// doc — sono OUTPUT della Fase 4/1, non codice sotto test: aggiornarli non deve ri-armare la
// verifica di Fase 3 (con un playbook `**/*` era proprio la doc-review a forzare una ri-verifica
// a ogni task). Chi vuole test sulla documentazione li dichiara su path NON registrati qui.
export function flowOwnedDocPatterns(projectRoot) {
  const config = readFlowConfig(projectRoot);
  const docPaths = (config.documentation?.docs ?? []).map((doc) => doc?.path).filter(Boolean);
  const architectureDocs = Object.values(config.architectureDocs?.byContext ?? {}).map((entry) => entry?.path).filter(Boolean);
  const changelogPath = config.changelog?.path;
  const specStore = config.specStore?.path ? `${config.specStore.path}/**` : null;
  return [...docPaths, ...architectureDocs, changelogPath, specStore].filter(Boolean);
}

// I file IGNORATI da git sono sottoprodotti per dichiarazione del progetto stesso (build, cache,
// report, .env): non sono codice sotto test e non entrano nell'hash di verifica. Senza git (o
// senza percorsi ignorati) il filtro è vuoto e restano le esclusioni statiche.
export function gitIgnoredPaths(projectRoot, relativePaths) {
  if (relativePaths.length === 0) {
    return new Set();
  }
  try {
    const stdout = execSync('git check-ignore --stdin', { cwd: projectRoot, input: `${relativePaths.join('\n')}\n`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(stdout.split('\n').filter(Boolean));
  } catch (error) {
    // exit 1 = nessun percorso ignorato (stdout vuoto); qualunque altro caso (niente git): nessun filtro.
    return new Set(typeof error?.stdout === 'string' ? error.stdout.split('\n').filter(Boolean) : []);
  }
}

export function currentVerificationHash(projectRoot) {
  const patterns = playbookPatterns(projectRoot);
  if (patterns.length === 0) {
    return 'no-playbook'; // niente perimetro dichiarato: l'hash non può ri-armare il gate
  }
  const exclude = [...VERIFICATION_EXCLUDE, ...flowOwnedDocPatterns(projectRoot)];
  const candidates = collectMatchingPaths(projectRoot, { exclude, include: patterns });
  const ignored = gitIgnoredPaths(projectRoot, candidates);
  const hash = createHash('sha256');
  for (const relativePath of candidates) {
    if (ignored.has(relativePath)) {
      continue;
    }
    try {
      hash.update(relativePath).update('\0').update(readFileSync(join(projectRoot, relativePath))).update('\0');
    } catch {
      // file svanito durante la scansione
    }
  }
  return hash.digest('hex');
}

// ————— Tempi del flusso: intervalli per passo e telemetria —————
// Ogni marcatore `sequencer → <passo>` apre un intervallo che si chiude al marcatore successivo
// (o alla chiusura del task). I passi che contengono fermate umane sono annotati: lì dentro c'è
// anche attesa, non solo lavoro macchina.

export const HUMAN_STOP_STEPS = new Set([
  'F1 · Specifica', // intervista + Gate 1
  'F2 · Piano', 'F2 · Piano (fast-path)', // Gate 2: piano + tier + branch
  'F2 · Branch',
  'F2 · Implementazione', // Gate 3 in coda
  'F5 · Consegna (ticket)', // scelta dello stato (senza un default di progetto)
]);

// Eventi delle fermate umane, scritti dall'hook questionTiming (Pre/PostToolUse su
// AskUserQuestion): l'attesa umana diventa un fatto MISURATO, non stimato.
export const QUESTION_ASKED_EVENT = 'fermata umana: domanda posta (AskUserQuestion)';
export const QUESTION_ANSWERED_EVENT = 'fermata umana: risposta ricevuta';

// Fatti che CHIUDONO un passo, in ordine canonico di fase. Servono a suddividere un intervallo di
// marcatore quando l'orchestratore ha eseguito più azioni senza richiamare `next` (misurato: test e
// implementazione assorbiti dentro "F2 · Piano" per 3h16). La suddivisione parte SOLO dal fatto che
// chiude il passo del marcatore stesso (la prova che il flusso è andato oltre senza `next`) e
// accetta i fatti successivi solo in ordine canonico crescente: così una verifica incorporata
// nell'implementazione (hook di fine turno) non viene etichettata come una Fase 3 a sé.
const STEP_CLOSING_FACTS = [
  { prefix: 'GATE UMANO approvato: spec', step: 'F1 · Specifica', order: 1 },
  { prefix: 'GATE UMANO approvato: plan', step: 'F2 · Piano', order: 2 },
  { prefix: 'test scritti e committati', step: 'F2 · Test (test-author)', order: 3 },
  { prefix: 'GATE UMANO approvato: diff', step: 'F2 · Implementazione', order: 4 },
  { prefix: 'verifica test:', step: 'F3 · Qualità', order: 5 },
  { prefix: 'doc-review:', step: 'F4 · Documentazione', order: 6 },
  { prefix: 'PR aperta:', step: 'F5 · Consegna (PR)', order: 7 },
];

function closingFactFor(eventText) {
  return STEP_CLOSING_FACTS.find((fact) => eventText.startsWith(fact.prefix)) ?? null;
}

function stepOrderOf(stepName) {
  // il nome del passo può portare suffissi ("(fast-path)"): si confronta per prefisso.
  const match = STEP_CLOSING_FACTS.find((fact) => stepName.startsWith(fact.step));
  return match ? match.order : null;
}

export function computeStepIntervals(state) {
  const log = state.log ?? [];
  const markers = log.filter((entry) => entry.event.startsWith('sequencer → '));
  const closedAt = state.phase === 'done' || state.phase === 'aborted' ? state.updatedAt : null;
  // Coppie domanda→risposta: una domanda senza risposta (turno interrotto) non fa coppia.
  const waits = [];
  let askedAt = null;
  for (const entry of log) {
    if (entry.event === QUESTION_ASKED_EVENT) {
      askedAt = entry.at;
    } else if (entry.event === QUESTION_ANSWERED_EVENT && askedAt !== null) {
      waits.push({ from: askedAt, to: entry.at });
      askedAt = null;
    }
  }
  const nowIso = new Date().toISOString();

  // Intervalli dai marcatori, poi eventuale suddivisione sui fatti di chiusura.
  const steps = [];
  markers.forEach((marker, index) => {
    const name = marker.event.slice('sequencer → '.length);
    const from = marker.at;
    const to = index + 1 < markers.length ? markers[index + 1].at : closedAt;
    const factsInside = log
      .filter((entry) => entry.at > from && (to === null || entry.at < to))
      .map((entry) => ({ at: entry.at, fact: closingFactFor(entry.event) }))
      .filter((entry) => entry.fact !== null);
    const markerOrder = stepOrderOf(name);
    const ownIndex = markerOrder === null ? -1 : factsInside.findIndex((entry) => entry.fact.order === markerOrder);
    if (ownIndex === -1) {
      steps.push({ name, from, to });
      return;
    }
    // il passo del marcatore si chiude al suo fatto; i fatti successivi (in ordine canonico
    // crescente) aprono i passi che il flusso ha attraversato senza `next`.
    const segments = [{ name, from, to: factsInside[ownIndex].at }];
    let lastOrder = markerOrder;
    for (const entry of factsInside.slice(ownIndex + 1)) {
      if (entry.fact.order <= lastOrder) {
        continue; // fuori sequenza (es. seconda verifica): resta nel segmento corrente
      }
      segments.push({ name: entry.fact.step, from: segments[segments.length - 1].to, to: entry.at });
      lastOrder = entry.fact.order;
    }
    segments[segments.length - 1].to = to; // il residuo (bookkeeping) resta nell'ultimo segmento
    steps.push(...segments);
  });

  // Fusione dei segmenti adiacenti con lo stesso nome (un fatto può chiudere ciò che il marcatore
  // successivo riapre) e calcolo delle attese per segmento.
  const merged = [];
  for (const step of steps) {
    const previous = merged[merged.length - 1];
    if (previous && previous.name === step.name) {
      previous.to = step.to;
    } else {
      merged.push({ ...step });
    }
  }
  for (const step of merged) {
    const end = step.to ?? nowIso;
    step.humanStop = HUMAN_STOP_STEPS.has(step.name);
    step.humanWaitMs = waits
      .filter((wait) => wait.from >= step.from && wait.from < end)
      .reduce((total, wait) => total + (new Date(wait.to) - new Date(wait.from)), 0);
  }
  const totalHumanWaitMs = waits.reduce((total, wait) => total + (new Date(wait.to) - new Date(wait.from)), 0);
  return { steps: merged, startedAt: state.startedAt, closedAt, firstMarkerAt: markers[0]?.at ?? null, totalHumanWaitMs };
}

export function formatMinutes(millis) {
  const minutes = Math.round(millis / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes}m`;
}

// Export OTLP dei tempi del flusso: arricchisce la telemetria di Claude Code (token/costo) con la
// dimensione che le manca — DOVE va il tempo di un task. Gauge su /v1/metrics (una serie per passo,
// più i totali del task) e un log di riepilogo su /v1/logs; encoding JSON, endpoint e attivazione
// da flow.config.telemetry (stessa sorgente di intento dello stack in telemetry/). Il timestamp dei
// datapoint è il momento dell'export (i backfill compaiono "ora": le date vere restano negli
// attributi); un endpoint irraggiungibile non blocca mai il flusso.
function toOtelAttributes(pairs) {
  return Object.entries(pairs)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      value: typeof value === 'boolean' ? { boolValue: value } : typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) },
    }));
}

async function postOtlpJson(endpoint, path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function exportTimingsToOtel(state, projectRoot) {
  const telemetry = readFlowConfig(projectRoot).telemetry ?? {};
  if (telemetry.enabled !== true) {
    return { sent: false, reason: 'telemetria disabilitata (flow.config.telemetry.enabled)' };
  }
  const endpoint = String(telemetry.otlpEndpoint ?? '').replace(/\/+$/, '');
  if (endpoint === '') {
    return { sent: false, reason: 'flow.config.telemetry.otlpEndpoint mancante' };
  }
  const { steps, startedAt, closedAt, totalHumanWaitMs } = computeStepIntervals(state);
  const finishedSteps = steps.filter((step) => step.to);
  if (finishedSteps.length === 0 && !closedAt) {
    return { sent: false, reason: 'nessun intervallo concluso da esportare' };
  }
  const timeUnixNano = `${Date.now()}000000`;
  const minutesBetween = (fromIso, toIso) => Math.round(((new Date(toIso) - new Date(fromIso)) / 60000) * 10) / 10;
  const taskAttributes = {
    'task.id': state.task.id,
    'task.type': state.task.type ?? 'unknown',
    'task.phase': state.phase,
    'fast.path': hasOverride(state, 'fast-path'),
  };
  const dataPoint = (value, attributes) => ({ timeUnixNano, asDouble: value, attributes: toOtelAttributes(attributes) });
  const gauge = (name, unit, dataPoints) => ({ name, unit, gauge: { dataPoints } });
  const metrics = [];
  if (finishedSteps.length > 0) {
    metrics.push(gauge('ai_dev_flow.step.duration_minutes', 'min', finishedSteps.map((step) =>
      dataPoint(minutesBetween(step.from, step.to), { ...taskAttributes, step: step.name, 'human.stops': step.humanStop }))));
    const stepsWithWait = finishedSteps.filter((step) => step.humanWaitMs > 0);
    if (stepsWithWait.length > 0) {
      metrics.push(gauge('ai_dev_flow.step.human_wait_minutes', 'min', stepsWithWait.map((step) =>
        dataPoint(Math.round((step.humanWaitMs / 60000) * 10) / 10, { ...taskAttributes, step: step.name }))));
    }
  }
  const verifications = (state.log ?? []).filter((entry) => entry.event.startsWith('verifica test:')).length;
  if (closedAt) {
    metrics.push(
      gauge('ai_dev_flow.task.duration_minutes', 'min', [dataPoint(minutesBetween(startedAt, closedAt), taskAttributes)]),
      gauge('ai_dev_flow.task.human_wait_minutes', 'min', [dataPoint(Math.round((totalHumanWaitMs / 60000) * 10) / 10, taskAttributes)]),
      gauge('ai_dev_flow.task.red_rounds', '1', [dataPoint((state.redRounds ?? []).length, taskAttributes)]),
      gauge('ai_dev_flow.task.verifications', '1', [dataPoint(verifications, taskAttributes)]),
      gauge('ai_dev_flow.task.overrides', '1', [dataPoint((state.overrides ?? []).length, taskAttributes)]),
    );
  }
  const resource = {
    attributes: toOtelAttributes({
      'service.name': telemetry.serviceName ?? 'ai-dev-flow',
      'project.name': telemetry.projectName ?? basename(resolve(projectRoot)),
    }),
  };
  const scope = { name: 'ai-dev-flow/flowState' };
  await postOtlpJson(endpoint, '/v1/metrics', { resourceMetrics: [{ resource, scopeMetrics: [{ scope, metrics }] }] });
  const stepsSummary = finishedSteps.map((step) => `${step.name}: ${formatMinutes(new Date(step.to) - new Date(step.from))}`).join(' · ');
  await postOtlpJson(endpoint, '/v1/logs', {
    resourceLogs: [{
      resource,
      scopeLogs: [{
        scope,
        logRecords: [{
          timeUnixNano,
          severityText: 'INFO',
          body: { stringValue: `AI-Dev Flow · task ${state.task.id} (${state.phase})${closedAt ? ` · totale ${formatMinutes(new Date(closedAt) - new Date(startedAt))}` : ''}${stepsSummary ? ` · ${stepsSummary}` : ''}` },
          attributes: toOtelAttributes({
            ...taskAttributes,
            event: 'flow-task-report',
            'started.at': startedAt,
            'closed.at': closedAt,
            'red.rounds': (state.redRounds ?? []).length,
            verifications,
            overrides: (state.overrides ?? []).length,
          }),
        }],
      }],
    }],
  });
  return { sent: true, endpoint };
}

// Tenta l'export e non blocca MAI il flusso: la telemetria è osservabilità, non un presidio.
async function tryExportTimings(state, projectRoot, { silentWhenDisabled = false } = {}) {
  try {
    const outcome = await exportTimingsToOtel(state, projectRoot);
    if (outcome.sent) {
      console.log(`Telemetria: tempi del task esportati via OTLP (${outcome.endpoint}).`);
    } else if (!silentWhenDisabled) {
      console.log(`Telemetria: export non eseguito — ${outcome.reason}.`);
    }
  } catch (error) {
    console.log(`Telemetria: endpoint OTLP non raggiungibile (${error.message}). Il task non è bloccato: riesporta quando vuoi con: flowState.mjs report --otel --task ${state.task.id}`);
  }
}

// ————— Il sequencer deterministico (comando `next`) —————
// Il "qual è il prossimo passo" NON è una decisione dell'LLM: è una funzione dei FATTI registrati.
// Prima condizione non soddisfatta = prossimo passo. L'orchestratore esegue, registra, richiama.
export function nextStep(state, projectRoot) {
  const cli = 'node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs"';
  const conn = state.task?.connector ?? '<ticketing>';
  const ref = state.task?.reference ?? state.task?.id;
  // Passi di consegna configurabili PER-PROGETTO (flow.config.delivery): una scelta stabile del
  // progetto (es. "qui non si commenta il ticket a spec approvata") si dichiara UNA volta nella
  // config committata, non si paga come domanda + deroga a ogni task.
  const delivery = readFlowConfig(projectRoot).delivery ?? {};
  const fastPath = hasOverride(state, 'fast-path');

  if (state.phase === 'done') {
    return { phase: 'done', action: 'Task già chiuso. Nulla da fare.', record: null };
  }
  if (state.phase === 'aborted') {
    return { phase: 'aborted', action: 'Task abbandonato. Nulla da fare (lo stato resta come audit trail).', record: null };
  }
  if (state.phase === 'intake') {
    return {
      phase: 'F0 · Intake',
      action: 'Completa l\'intake: contract-check dei connettori, lettura del ticket via connettore, normalizzazione IN LINEA (estrai tu dal JSON del connettore: tipo CR/BUG, priorità, riferimenti, cliente, allegati, riproduzione sì/no per i BUG, candidatura fast-path dai segnali del ticket — il JSON è già nel tuo contesto: uno spawn costerebbe più del lavoro). Niente codebase.',
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
  if ((state.ticketUpdates ?? []).length === 0 && delivery.specTicketComment !== false) {
    return {
      phase: 'F1 · Specifica (chiusura)',
      action: `Commenta il task nel ticketing col riferimento alla spec: node "\${CLAUDE_PLUGIN_ROOT}/connectors/${conn}.mjs" --comment "${ref}" "Spec approvata: <path>"`,
      record: `${cli} record-ticket-update --status "spec-approvata"`,
    };
  }
  if (!state.gates?.plan) {
    // Fast-path: la fase di piano si COMPRIME, il gate umano resta. La spec ha già i file previsti
    // e l'approccio di una modifica circoscritta: un plan-author (tier top, lettura profonda) su
    // 20 righe di diff è il costo fisso che il fast-path esiste per tagliare.
    if (fastPath) {
      return {
        phase: 'F2 · Piano (fast-path)',
        action: 'FAST-PATH attivo: NON lanciare plan-author. Il piano compresso è nella spec approvata (file previsti, approccio): presentalo TU al GATE UMANO 2 in 5-10 righe, coi rischi. Se preparandolo scopri che la modifica NON è più circoscritta (più file/aree, schema dati, API pubbliche), dillo all\'utente: si rientra nel percorso completo lanciando plan-author.',
        record: `ad approvazione dell'utente: ${cli} approve-gate plan`,
      };
    }
    return {
      phase: 'F2 · Piano',
      action: 'Lancia il sub-agent plan-author (spec approvata + file letti in Fase 1 + architecture doc + convenzioni + test-playbook): produce approccio, file toccati, ordine, rischi, test previsti dal playbook e le NOTE DI COMPLESSITÀ. Presenta TU il PIANO al GATE UMANO 2 in UNA SOLA FERMATA (una AskUserQuestion): approvazione del piano, tier di implementazione (informato dalle note di complessità), branch base e nome proposto — ogni stop in più è un context switch per chi risponde.',
      record: `ad approvazione dell'utente: ${cli} approve-gate plan · e con la stessa risposta: ${cli} set-branch --name <branch> --base <base>`,
    };
  }
  if (!state.branch?.name && !hasOverride(state, 'branch')) {
    return {
      phase: 'F2 · Branch',
      action: 'Crea il branch di lavoro PRIMA di ogni commit (se non l\'hai già deciso col Gate 2): chiedi all\'utente il branch base e proponi <fix|feat>/<nome-breve-esplicativo> (nome custom ammesso). Poi: git checkout -b <branch>.'
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
  if (!state.testsAuthored && !fastPath) {
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
  const codeHash = currentVerificationHash(projectRoot);
  const verificationIsCurrent = Boolean(state.verification) && state.verification.diffHash === codeHash;
  // Rossi registrati sul codice ATTUALE: il passo successivo è tornare a implementare, non andare
  // avanti. Al ripetersi dei giri rossi il sequencer propone l'escalation di tier: è il segnale
  // OGGETTIVO che il lavoro è più difficile di quanto sembrava al gate (nessuna stima ex-ante).
  if (verificationIsCurrent && state.verification.status === 'failed') {
    const models = readFlowConfig(projectRoot).models ?? {};
    const redRounds = (state.redRounds ?? []).length;
    const threshold = Number(models.escalateAfterRedRounds ?? 2);
    const escalationDue = threshold > 0 && redRounds >= threshold && !hasOverride(state, 'model-tier');
    return {
      phase: 'F2 · Implementazione (rientro dai rossi)',
      action: `I test sono ROSSI sul codice attuale (giri rossi: ${redRounds}). Correggi il CODICE: i test NON si toccano — se un test è sbagliato rispetto alla spec, segnalalo all'utente invece di adattarlo.`
        + (escalationDue
          ? ` — SOGLIA DI ESCALATION RAGGIUNTA (${threshold}): proponi all'utente di riprendere questo passo col tier "${models.escalation ?? 'opus'}" (in Claude Code: /model ${models.escalation ?? 'opus'}). La scelta è SUA e va registrata; se rifiuta, si continua col tier corrente.`
          : ''),
      record: escalationDue
        ? `se l'utente accetta l'escalation: ${cli} record-override --gate model-tier --reason "<scelta utente>" · a rossi risolti: ${cli} record-verification --status done --tests "<nomi>"`
        : `a rossi risolti: ${cli} record-verification --status done --tests "<nomi>"`,
    };
  }
  if (!verificationIsCurrent) {
    return {
      phase: 'F3 · Qualità',
      action: `Seleziona i test dal test-playbook (test-selector) e falli eseguire al sub-agent test-runner${state.verification ? ' — il codice COPERTO DAL PLAYBOOK è cambiato dopo l\'ultima verifica: va rifatta' : ''}. Rossi → si torna all'implementazione: registrali con --status failed (un rosso è un fatto, non un non-evento).`,
      record: `${cli} record-verification --status done|failed --tests "<nomi>"`,
    };
  }
  if (!state.docReview) {
    return {
      phase: fastPath ? 'F4 · Documentazione (fast-path)' : 'F4 · Documentazione',
      action: fastPath
        ? 'FAST-PATH attivo: valuta TU l\'impatto sui documenti del registro (flow.config.documentation.docs) leggendo il diff — su una modifica circoscritta l\'esito tipico è "nessun impatto, perché…", che è valido e registrabile. Lancia doc-author solo se un documento va davvero aggiornato.'
        : 'Lancia il sub-agent doc-author (spec + diff + registro flow.config.documentation.docs + architecture doc): aggiorna i documenti impattati o dichiara "nessun impatto, perché…".',
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
  // Senza branch di lavoro (progetto senza git, deroga registrata) non esiste una PR da proporre:
  // la consegna è il solo aggiornamento del ticket, e il riferimento temporale diventa il changelog.
  if (!state.pr && state.branch?.name && delivery.pr !== false) {
    return {
      phase: 'F5 · Consegna (PR)',
      action: `Proponi la PR da ${state.branch.name} verso ${state.branch.base} (titolo dalla spec, corpo con link a spec/changelog/ticket).`,
      record: `${cli} record-pr --url <url>`,
    };
  }
  const deliveryReference = state.pr?.at ?? state.changelog?.updatedAt ?? '';
  const finalTicketUpdate = (state.ticketUpdates ?? []).some((u) => u.at > deliveryReference);
  if (!finalTicketUpdate && delivery.ticketUpdate !== false) {
    // Con un default di progetto (delivery.ticketStatus) lo stato di arrivo è già deciso:
    // niente domanda — una scelta stabile non si ripete a ogni task.
    const ticketStatus = typeof delivery.ticketStatus === 'string' && delivery.ticketStatus.trim() !== '' ? delivery.ticketStatus : null;
    return {
      phase: 'F5 · Consegna (ticket)',
      action: ticketStatus
        ? `Aggiorna lo stato del ticket a "${ticketStatus}" (default di progetto flow.config.delivery.ticketStatus: niente domanda): node "\${CLAUDE_PLUGIN_ROOT}/connectors/${conn}.mjs" --update-status "${ref}" "${ticketStatus}"`
        : `Aggiorna lo stato del ticket (chiedi all'utente: Review o Done): node "\${CLAUDE_PLUGIN_ROOT}/connectors/${conn}.mjs" --update-status "${ref}" "<stato>"`,
      record: `${cli} record-ticket-update --status "${ticketStatus ?? '<stato>'}"`,
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

async function runCli() {
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
    // Report dei tempi (vedi computeStepIntervals). Con --otel esporta anche via OTLP.
    case 'report': {
      const { steps, startedAt, closedAt, firstMarkerAt, totalHumanWaitMs } = computeStepIntervals(state);
      if (steps.length === 0) {
        console.log(`Task "${state.task.id}": nessun inizio-azione nel log. Il report per-passo richiede task lavorati con kit >= 0.5.0 (il sequencer registra i marcatori "sequencer → <passo>").`);
        return;
      }
      console.log(`Report tempi — task "${state.task.id}" (fase: ${state.phase})`);
      console.log(`  avvio → primo passo: ${formatMinutes(new Date(firstMarkerAt) - new Date(startedAt))}`);
      for (const step of steps) {
        const waitNote = step.humanWaitMs > 0 ? `, di cui attesa alle domande ${formatMinutes(step.humanWaitMs)}` : (step.humanStop ? '  (include fermate umane)' : '');
        console.log(`  ${step.name}: ${step.to ? formatMinutes(new Date(step.to) - new Date(step.from)) : `in corso da ${formatMinutes(Date.now() - new Date(step.from))}`}${waitNote}`);
      }
      const verifications = (state.log ?? []).filter((entry) => entry.event.startsWith('verifica test:')).length;
      console.log(`  totale: ${closedAt ? formatMinutes(new Date(closedAt) - new Date(startedAt)) : `in corso da ${formatMinutes(Date.now() - new Date(startedAt))}`}`
        + `${totalHumanWaitMs > 0 ? ` · attesa umana misurata: ${formatMinutes(totalHumanWaitMs)}` : ''}`
        + ` · verifiche registrate: ${verifications} · giri rossi: ${(state.redRounds ?? []).length}`);
      if (options.otel === true) {
        await tryExportTimings(state, projectRoot);
      }
      return;
    }
    case 'next': {
      const step = nextStep(state, projectRoot);
      // Strumentazione degli inizi-azione: la prima volta che il sequencer indica un passo, il
      // fatto va nel log. Dedup sul marcatore più recente: i richiami dello stesso passo non
      // spammano, ma un RITORNO a un passo già visto (es. verifica ri-armata) si registra di
      // nuovo — è esattamente ciò che si vuole misurare.
      if (step.record !== null) {
        const startMarker = `sequencer → ${step.phase}`;
        const lastStartMarker = [...(state.log ?? [])].reverse().find((entry) => entry.event.startsWith('sequencer → '));
        if (lastStartMarker?.event !== startMarker) {
          appendLog(state, startMarker);
          saveTaskState(projectRoot, state);
        }
      }
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
      await tryExportTimings(state, projectRoot, { silentWhenDisabled: true });
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
      if (!['done', 'failed', 'skipped'].includes(status)) {
        failCli('record-verification: --status deve essere done|failed|skipped');
      }
      if (status === 'skipped' && !options.reason) {
        failCli('record-verification: lo skip richiede --reason (le deroghe sono auditabili).');
      }
      const tests = options.tests ? String(options.tests).split(',').map((name) => name.trim()).filter(Boolean) : [];
      state.verification = {
        status,
        tests,
        reason: options.reason ?? null,
        // Il campo si chiama ancora diffHash (stabilità dello schema), ma dalla 0.5.0 è l'hash del
        // CONTENUTO dei file coperti dal test-playbook: doc/changelog/commit non lo cambiano.
        diffHash: currentVerificationHash(projectRoot),
        at: new Date().toISOString(),
      };
      // Un ROSSO è un fatto, non un non-evento: registrarlo rende il rientro in implementazione
      // visibile al sequencer e conta i giri, che è ciò su cui si decide un'escalation di tier.
      if (status === 'failed') {
        state.redRounds ??= [];
        state.redRounds.push({ tests, reason: options.reason ?? null, at: new Date().toISOString() });
      }
      appendLog(state, `verifica test: ${status}${status === 'failed' ? ` (giro rosso n. ${state.redRounds.length})` : ''}${options.reason ? ` (${options.reason})` : ''}`);
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
      await tryExportTimings(state, projectRoot, { silentWhenDisabled: true });
      return;
    }
    default:
      failCli(`Comando sconosciuto: "${command}". Vedi l'intestazione di flowState.mjs.`);
  }

  saveTaskState(projectRoot, state);
  console.log(`OK — stato del task "${state.task.id}" aggiornato (${command}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
