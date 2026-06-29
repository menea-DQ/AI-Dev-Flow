#!/usr/bin/env node
// Connettore ticketing: Productive (REST api.productive.io/api/v2).
// Contratto: node productive.mjs <url-o-id> → stampa JSON normalizzato su stdout.
// Env richiesto: PRODUCTIVE_API_TOKEN. L'organization id si ricava dall'URL.

const PRODUCTIVE_API_BASE_URL = 'https://api.productive.io/api/v2';

async function main() {
  const taskReference = process.argv[2];
  if (!taskReference) {
    fail('Uso: node productive.mjs <url-o-id-del-task-productive>');
  }

  const productiveApiToken = process.env.PRODUCTIVE_API_TOKEN;
  if (!productiveApiToken) {
    fail('PRODUCTIVE_API_TOKEN non impostata. Imposta il token API di Productive nell\'ambiente.');
  }

  const { organizationId, taskId } = parseTaskReference(taskReference);
  if (!organizationId) {
    fail('Impossibile ricavare l\'organization id: passa un URL Productive completo (app.productive.io/<org>-…/tasks/task/<id>).');
  }

  const response = await fetch(`${PRODUCTIVE_API_BASE_URL}/tasks/${taskId}`, {
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
  process.stdout.write(`${JSON.stringify(normalizeTask(payload), null, 2)}\n`);
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

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => fail(error.message));
