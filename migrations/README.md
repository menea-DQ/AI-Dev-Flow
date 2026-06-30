# Migrazioni del kit

Quando una nuova versione del kit cambia il **formato degli artefatti per-progetto** (struttura di
`flow.config.json`, blocco env del `settings.json`, nomi di campi, ecc.), qui si aggiunge una migrazione
che trasforma i dati dal vecchio al nuovo formato. `bin/migrate.mjs` le applica in ordine, portando
`flow.lock.json.kitVersion` dalla versione installata a quella corrente.

Le versioni che **non** cambiano il formato non hanno bisogno di un file qui: `migrate` fa comunque il
bump della versione nel lockfile (no-op di formato).

## Convenzione

- Nome file: `<from>-to-<to>.mjs`, con versioni semver — es. `0.0.1-to-0.0.2.mjs`.
- Export di default: una funzione `async (context) => { … }`.
- Deve essere **idempotente** (rieseguibile senza danni) e usare SOLO le helper del context (così le
  modifiche sono tracciate e il rollback transazionale funziona).

## Il context

```js
export default async function up(context) {
  const config = await context.readJson('flow.config.json');   // null se assente
  // ... trasforma ...
  if (config && config.tokenEconomy && config.tokenEconomy.headroom === undefined) {
    config.tokenEconomy.headroom = false;
    context.log('aggiunto tokenEconomy.headroom = false');
  }
  await context.writeJson('flow.config.json', config);
  // helper disponibili: readText, writeText, readJson, writeJson, log; projectRoot
}
```

`migrate` esegue in ordine di `to` crescente tutte le migrazioni con `to` in
`(installedVersion, currentVersion]`. A fine corsa aggiorna `flow.lock.json` alla versione corrente.
A errore, ripristina tutti i file toccati (rollback).
