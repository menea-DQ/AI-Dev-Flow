# Connettori (ticketing / helpdesk)

I connettori sono **agnostici e sostituibili**, ma il kit ne ship già due **pronti**, perché in azienda
si usano sempre questi: **Productive** (ticketing) e **Zammad** (helpdesk). L'install NON chiede quale
tool usare: i default sono `productive` e `zammad` (vedi `flow.config.connectors`). Per cambiare,
si modifica `flow.config` con la skill `flow-settings` — non si reimplementa nulla a ogni progetto.

## Contratto agnostico

Un connettore è un comando invocabile così:

    node "${CLAUDE_PLUGIN_ROOT}/connectors/<nome>.mjs" "<url-o-id-del-ticket>"

Stampa su **stdout** un oggetto JSON normalizzato (il "contesto richiesta" grezzo che l'intake-parser
poi rifinisce):

```json
{
  "connector": "productive",
  "kind": "ticketing",
  "id": "12345",
  "number": "T-678",
  "title": "…",
  "description": "…",
  "references": ["https://helpdesk.example.org/#ticket/zoom/42"],
  "customer": null,
  "attachments": [
    { "name": "screenshot.png", "contentType": "image/png", "size": 20481,
      "url": "https://files.productive.io/…", "localPath": ".ai-dev/attachments/productive-4567/screenshot.png" }
  ],
  "raw": { "…": "payload grezzo, opzionale" }
}
```

Gli **allegati** (campo `attachments`, opzionale) sono scaricati su disco e referenziati col percorso
locale, così l'agente può aprirli (es. screenshot). Sono salvati in `.ai-dev/attachments/<connector>-<id>/`,
cartella **gitignorata** (il connettore crea `.ai-dev/attachments/.gitignore`). Su Productive il download
usa il dominio `files.productive.io` con `?token=<PRODUCTIVE_API_TOKEN>` (auth diversa dalla lettura del task).

In caso di errore: messaggio chiaro su **stderr** ed exit code ≠ 0 (es. credenziale mancante con
indicazione di quale variabile d'ambiente impostare).

## Connettori pronti

- `productive.mjs` — ticketing. REST `api.productive.io/api/v2`. Env: `PRODUCTIVE_API_TOKEN`
  (l'organization id si ricava dall'URL). Estrae eventuali URL di helpdesk dai custom field in `references`.
- `zammad.mjs` — helpdesk. REST `<base>/api/v1/...`. Env: `ZAMMAD_API_TOKEN` e, se l'istanza è dietro
  Cloudflare Access, `ZAMMAD_CF_AUTHORIZATION` (cookie CF_Authorization da una sessione autenticata).

## Aggiungere un connettore (es. Jira)

Crea `connectors/<nome>.mjs` che rispetti il contratto sopra, poi imposta in `flow.config`
`connectors.ticketing` (o `.helpdesk`) = `"<nome>"`. Nessun'altra modifica: skill e intake restano uguali.

## Credenziali

I connettori **caricano automaticamente** il file env del progetto `flow.config.connectors.envFile`
(default **`.ai-dev/connectors.env`**, gitignorato) prima di leggere le credenziali; le variabili già
esportate nell'ambiente reale hanno la precedenza. Quindi metti le credenziali in
`.ai-dev/connectors.env` del progetto (l'install lo scaffolda da `.env.example`) — NON nel `connectors/`
del plugin (che vive nella cache ed è sovrascritto agli aggiornamenti). Non committare i segreti.
