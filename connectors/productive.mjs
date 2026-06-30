#!/usr/bin/env node
// Connettore ticketing: Productive (REST api.productive.io/api/v2).
// Contratto: node productive.mjs <url-o-id> → stampa JSON normalizzato su stdout.
// Env richiesto: PRODUCTIVE_API_TOKEN. L'organization id si ricava dall'URL.
// Scarica gli allegati del task (include=attachments) in .ai-dev/attachments/productive-<id>/
// (cartella gitignorata) e li elenca nell'output con il percorso locale.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PRODUCTIVE_API_BASE_URL = process.env.PRODUCTIVE_API_BASE_URL ?? 'https://api.productive.io/api/v2';

async function main() {
  if (process.argv[2] === '--check') {
    return runCheck();
  }
  const taskReference = process.argv[2];
  if (!taskReference) {
    fail('Uso: node productive.mjs <url-o-id-del-task-productive> | --check');
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
