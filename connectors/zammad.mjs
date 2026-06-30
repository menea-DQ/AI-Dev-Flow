#!/usr/bin/env node
// Connettore helpdesk: Zammad (REST <base>/api/v1).
// Contratto: node zammad.mjs <url-del-ticket> → stampa JSON normalizzato su stdout.
// Env richiesto: ZAMMAD_API_TOKEN. Opzionale (istanze dietro Cloudflare Access): ZAMMAD_CF_AUTHORIZATION.

async function main() {
  if (process.argv[2] === '--check') {
    return runCheck();
  }
  const ticketUrl = process.argv[2];
  if (!ticketUrl) {
    fail('Uso: node zammad.mjs <url-del-ticket-zammad> | --check');
  }

  const zammadApiToken = process.env.ZAMMAD_API_TOKEN;
  if (!zammadApiToken) {
    fail('ZAMMAD_API_TOKEN non impostata. Imposta il token API di Zammad nell\'ambiente.');
  }
  const cloudflareAuthorizationCookie = process.env.ZAMMAD_CF_AUTHORIZATION ?? null;

  const { baseUrl, ticketId } = parseTicketUrl(ticketUrl);
  const ticket = await fetchZammad(`${baseUrl}/api/v1/tickets/${ticketId}`, zammadApiToken, cloudflareAuthorizationCookie);
  const articles = await fetchZammad(`${baseUrl}/api/v1/ticket_articles/by_ticket/${ticketId}`, zammadApiToken, cloudflareAuthorizationCookie);
  process.stdout.write(`${JSON.stringify(normalizeTicket(ticket, articles), null, 2)}\n`);
}

function parseTicketUrl(ticketUrl) {
  const ticketIdMatch = ticketUrl.match(/#ticket\/zoom\/(\d+)/) ?? ticketUrl.match(/\/tickets\/(\d+)/);
  if (!ticketIdMatch) {
    fail(`Impossibile ricavare il ticket id da: ${ticketUrl}`);
  }
  return { baseUrl: new URL(ticketUrl).origin, ticketId: ticketIdMatch[1] };
}

async function fetchZammad(url, zammadApiToken, cloudflareAuthorizationCookie) {
  const headers = { Authorization: `Token token=${zammadApiToken}` };
  if (cloudflareAuthorizationCookie) {
    headers.Cookie = `CF_Authorization=${cloudflareAuthorizationCookie}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    fail(`Richiesta a Zammad fallita (${response.status}) su ${url}: ${await response.text()}`);
  }
  return response.json();
}

function normalizeTicket(ticket, articles) {
  const publicArticles = Array.isArray(articles) ? articles.filter((article) => !article.internal) : [];
  const description = publicArticles
    .map((article) => (article.body ?? '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  return {
    connector: 'zammad',
    kind: 'helpdesk',
    id: ticket?.id ?? null,
    number: ticket?.number ?? null,
    title: ticket?.title ?? null,
    description: description || null,
    references: [],
    customer: ticket?.customer_id ?? null,
    raw: { articleCount: publicArticles.length },
  };
}

async function runCheck() {
  const zammadApiToken = process.env.ZAMMAD_API_TOKEN;
  const baseUrl = process.env.ZAMMAD_BASE_URL;
  if (!zammadApiToken || !baseUrl) {
    return reportCheck({ ok: false, status: 'config-missing', detail: 'Servono ZAMMAD_API_TOKEN e ZAMMAD_BASE_URL per il probe.' });
  }
  const cloudflareAuthorizationCookie = process.env.ZAMMAD_CF_AUTHORIZATION ?? null;
  const headers = { Authorization: `Token token=${zammadApiToken}` };
  if (cloudflareAuthorizationCookie) {
    headers.Cookie = `CF_Authorization=${cloudflareAuthorizationCookie}`;
  }
  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/users/me`, { headers });
  } catch (error) {
    return reportCheck({ ok: false, status: 'unreachable', detail: error.message });
  }
  if (response.status === 401 || response.status === 403) {
    return reportCheck({ ok: false, status: 'auth-failed', detail: `HTTP ${response.status}: token o cookie Cloudflare non validi.` });
  }
  if (!response.ok) {
    return reportCheck({ ok: false, status: 'drift', detail: `HTTP ${response.status} su /api/v1/users/me: la API potrebbe essere cambiata.` });
  }
  return reportCheck({ ok: true, status: 'ok', detail: 'Autenticazione e raggiungibilità verificate.' });
}

function reportCheck(result) {
  process.stdout.write(`${JSON.stringify({ connector: 'zammad', kind: 'helpdesk', ...result })}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => fail(error.message));
