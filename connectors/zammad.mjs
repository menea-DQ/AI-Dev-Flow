#!/usr/bin/env node
// Connettore helpdesk: Zammad (REST <base>/api/v1).
// Contratto: node zammad.mjs <url-del-ticket> → stampa JSON normalizzato su stdout.
// Env richiesto: ZAMMAD_API_TOKEN. Opzionale (istanze dietro Cloudflare Access): ZAMMAD_CF_AUTHORIZATION.

async function main() {
  const ticketUrl = process.argv[2];
  if (!ticketUrl) {
    fail('Uso: node zammad.mjs <url-del-ticket-zammad>');
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

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => fail(error.message));
