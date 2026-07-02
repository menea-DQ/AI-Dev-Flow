#!/usr/bin/env node
// Connettore ticketing: Productive (REST api.productive.io/api/v2).
// Contratto (lettura):  node productive.mjs <url-o-id> → stampa JSON normalizzato su stdout.
// Contratto (scrittura, GAP-02 — operazioni deterministiche di fine fase):
//   node productive.mjs --update-status <url-o-id> "<nome-stato>"   (es. "In review", "Done")
//   node productive.mjs --comment <url-o-id> "<testo>"              (commento sul task, es. link a spec/PR)
// Env richiesto: PRODUCTIVE_API_TOKEN. L'organization id si ricava dall'URL (o PRODUCTIVE_ORG_ID).
// Scarica gli allegati del task (include=attachments) in .ai-dev/attachments/productive-<id>/
// (cartella gitignorata) e li elenca nell'output con il percorso locale.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConnectorEnv } from './connectorEnv.mjs';

const PRODUCTIVE_API_BASE_URL = process.env.PRODUCTIVE_API_BASE_URL ?? 'https://api.productive.io/api/v2';

async function main() {
  loadConnectorEnv();
  if (process.argv[2] === '--check') {
    return runCheck();
  }
  if (process.argv[2] === '--update-status') {
    return runUpdateStatus(process.argv[3], process.argv[4]);
  }
  if (process.argv[2] === '--comment') {
    return runComment(process.argv[3], process.argv[4]);
  }
  const taskReference = process.argv[2];
  if (!taskReference) {
    fail('Uso: node productive.mjs <url-o-id> | --check | --update-status <url-o-id> "<stato>" | --comment <url-o-id> "<testo>"');
  }

  const productiveApiToken = process.env.PRODUCTIVE_API_TOKEN;
  if (!productiveApiToken) {
    fail('PRODUCTIVE_API_TOKEN non impostata. Imposta il token API di Productive nell\'ambiente.');
  }

  const { organizationId, taskId } = parseTaskReference(taskReference);
  if (!organizationId) {
    fail('Impossibile ricavare l\'organization id: passa un URL Productive completo (app.productive.io/<org>-…/tasks/task/<id>).');
  }

  const response = await fetch(`${PRODUCTIVE_API_BASE_URL}/tasks/${taskId}?include=attachments`, {
    headers: {
      'X-Auth-Token': productiveApiToken,
      'X-Organization-Id': organizationId,
      'Content-Type': 'application/vnd.api+json',
    },
  });
  if (!response.ok) {
    fail(`Richiesta a Productive fallita (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  const normalized = normalizeTask(payload);
  normalized.attachments = await downloadAttachments(payload, taskId, productiveApiToken);
  process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
}

function parseTaskReference(taskReference) {
  const organizationIdMatch = taskReference.match(/app\.productive\.io\/(\d+)-/);
  const taskIdMatch = taskReference.match(/\/tasks\/task\/(\d+)/);
  if (taskIdMatch) {
    return { organizationId: organizationIdMatch ? organizationIdMatch[1] : null, taskId: taskIdMatch[1] };
  }
  if (/^\d+$/.test(taskReference)) {
    return { organizationId: process.env.PRODUCTIVE_ORG_ID ?? null, taskId: taskReference };
  }
  fail(`Impossibile ricavare il task id da: ${taskReference}`);
  return { organizationId: null, taskId: null };
}

function normalizeTask(payload) {
  const attributes = payload?.data?.attributes ?? {};
  const customFields = attributes.custom_fields ?? {};
  return {
    connector: 'productive',
    kind: 'ticketing',
    id: payload?.data?.id ?? null,
    number: attributes.task_number ?? null,
    title: attributes.title ?? null,
    description: attributes.description || null,
    references: extractReferences(customFields),
    customer: null,
    raw: { customFields },
  };
}

function extractReferences(customFields) {
  const references = [];
  for (const value of Object.values(customFields)) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/https?:\/\/[^\s"']+/g)) {
        references.push(match[0]);
      }
    }
  }
  return references;
}

async function downloadAttachments(payload, taskId, productiveApiToken) {
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const attachmentResources = included.filter((resource) => resource.type === 'attachments');
  if (attachmentResources.length === 0) {
    return [];
  }

  const relativeDirectory = join('.ai-dev', 'attachments', `productive-${taskId}`);
  const absoluteDirectory = join(process.cwd(), relativeDirectory);
  await mkdir(absoluteDirectory, { recursive: true });
  await ensureAttachmentsGitignore();

  const downloaded = [];
  for (const resource of attachmentResources) {
    const attributes = resource.attributes ?? {};
    const fileName = sanitizeFileName(attributes.name || `attachment-${resource.id}`);
    const downloadUrl = attributes.url || attributes.temp_url || null;
    const base = { name: fileName, contentType: attributes.content_type ?? null, size: attributes.size ?? null, url: downloadUrl };
    if (!downloadUrl) {
      downloaded.push({ ...base, localPath: null, error: 'nessun url di download' });
      continue;
    }
    try {
      const fileResponse = await fetch(appendToken(downloadUrl, productiveApiToken));
      if (!fileResponse.ok) {
        throw new Error(`HTTP ${fileResponse.status}`);
      }
      const fileBytes = Buffer.from(await fileResponse.arrayBuffer());
      await writeFile(join(absoluteDirectory, fileName), fileBytes);
      downloaded.push({ ...base, localPath: join(relativeDirectory, fileName) });
    } catch (error) {
      downloaded.push({ ...base, localPath: null, error: error.message });
    }
  }
  return downloaded;
}

function appendToken(downloadUrl, productiveApiToken) {
  const parsed = new URL(downloadUrl);
  parsed.searchParams.set('token', productiveApiToken);
  return parsed.toString();
}

function sanitizeFileName(name) {
  const cleaned = name.replace(/[\\/]/g, '_').replace(/^\.+/, '').trim();
  return cleaned === '' ? 'attachment' : cleaned;
}

async function ensureAttachmentsGitignore() {
  const gitignorePath = join(process.cwd(), '.ai-dev', 'attachments', '.gitignore');
  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, '*\n!.gitignore\n');
  }
}

function productiveHeaders(productiveApiToken, organizationId) {
  return {
    'X-Auth-Token': productiveApiToken,
    'X-Organization-Id': organizationId,
    'Content-Type': 'application/vnd.api+json',
  };
}

function requireWriteContext(taskReference, usage) {
  const productiveApiToken = process.env.PRODUCTIVE_API_TOKEN;
  if (!productiveApiToken) {
    fail('PRODUCTIVE_API_TOKEN non impostata. Imposta il token API di Productive nell\'ambiente.');
  }
  if (!taskReference) {
    fail(usage);
  }
  const { organizationId, taskId } = parseTaskReference(taskReference);
  if (!organizationId) {
    fail('Impossibile ricavare l\'organization id: passa un URL Productive completo o imposta PRODUCTIVE_ORG_ID.');
  }
  return { productiveApiToken, organizationId, taskId };
}

// Aggiorna lo stato del task risolvendo il NOME dello stato (case-insensitive) tra i
// workflow_statuses dell'organizzazione, poi PATCH della relazione workflow_status del task.
async function runUpdateStatus(taskReference, statusName) {
  const usage = 'Uso: node productive.mjs --update-status <url-o-id> "<nome-stato>"';
  if (!statusName) {
    fail(usage);
  }
  const { productiveApiToken, organizationId, taskId } = requireWriteContext(taskReference, usage);
  const headers = productiveHeaders(productiveApiToken, organizationId);

  const statusesResponse = await fetch(`${PRODUCTIVE_API_BASE_URL}/workflow_statuses?page[size]=200`, { headers });
  if (!statusesResponse.ok) {
    fail(`Lettura dei workflow status fallita (${statusesResponse.status}): ${await statusesResponse.text()}`);
  }
  const statuses = (await statusesResponse.json())?.data ?? [];
  const wanted = statusName.trim().toLowerCase();
  const match = statuses.find((status) => (status?.attributes?.name ?? '').trim().toLowerCase() === wanted);
  if (!match) {
    const available = [...new Set(statuses.map((status) => status?.attributes?.name).filter(Boolean))];
    fail(`Stato "${statusName}" non trovato tra i workflow status di Productive. Disponibili: ${available.join(', ') || '(nessuno leggibile)'}`);
  }

  const patchResponse = await fetch(`${PRODUCTIVE_API_BASE_URL}/tasks/${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      data: {
        type: 'tasks',
        id: String(taskId),
        relationships: { workflow_status: { data: { type: 'workflow_statuses', id: String(match.id) } } },
      },
    }),
  });
  if (!patchResponse.ok) {
    fail(`Aggiornamento stato fallito (${patchResponse.status}): ${await patchResponse.text()}`);
  }
  process.stdout.write(`${JSON.stringify({ connector: 'productive', action: 'update-status', ok: true, id: String(taskId), status: match.attributes.name })}\n`);
}

// Aggiunge un commento al task (es. link alla spec o alla PR).
async function runComment(taskReference, commentText) {
  const usage = 'Uso: node productive.mjs --comment <url-o-id> "<testo>"';
  if (!commentText) {
    fail(usage);
  }
  const { productiveApiToken, organizationId, taskId } = requireWriteContext(taskReference, usage);
  const response = await fetch(`${PRODUCTIVE_API_BASE_URL}/comments`, {
    method: 'POST',
    headers: productiveHeaders(productiveApiToken, organizationId),
    body: JSON.stringify({
      data: {
        type: 'comments',
        attributes: { body: escapeHtml(commentText).replace(/\n/g, '<br>') },
        relationships: { task: { data: { type: 'tasks', id: String(taskId) } } },
      },
    }),
  });
  if (!response.ok) {
    fail(`Creazione commento fallita (${response.status}): ${await response.text()}`);
  }
  const created = await response.json();
  process.stdout.write(`${JSON.stringify({ connector: 'productive', action: 'comment', ok: true, id: String(taskId), commentId: created?.data?.id ?? null })}\n`);
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runCheck() {
  const productiveApiToken = process.env.PRODUCTIVE_API_TOKEN;
  const organizationId = process.env.PRODUCTIVE_ORG_ID;
  if (!productiveApiToken || !organizationId) {
    return reportCheck({ ok: false, status: 'config-missing', detail: 'Servono PRODUCTIVE_API_TOKEN e PRODUCTIVE_ORG_ID per il probe.' });
  }
  let response;
  try {
    response = await fetch(`${PRODUCTIVE_API_BASE_URL}/people?page[size]=1`, {
      headers: {
        'X-Auth-Token': productiveApiToken,
        'X-Organization-Id': organizationId,
        'Content-Type': 'application/vnd.api+json',
      },
    });
  } catch (error) {
    return reportCheck({ ok: false, status: 'unreachable', detail: error.message });
  }
  if (response.status === 401 || response.status === 403) {
    return reportCheck({ ok: false, status: 'auth-failed', detail: `HTTP ${response.status}: token/organization non validi.` });
  }
  if (!response.ok) {
    return reportCheck({ ok: false, status: 'drift', detail: `HTTP ${response.status} sull'endpoint di probe: la API potrebbe essere cambiata.` });
  }
  return reportCheck({ ok: true, status: 'ok', detail: 'Autenticazione e raggiungibilità verificate.' });
}

function reportCheck(result) {
  process.stdout.write(`${JSON.stringify({ connector: 'productive', kind: 'ticketing', ...result })}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => fail(error.message));
