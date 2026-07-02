// Migrazione 0.0.6 → 0.0.7
// La 0.0.7 introduce: stato per-task (.ai-dev/tasks/), branching obbligatorio, registro della
// documentazione (Fase 4), enforcement del perimetro "solo componenti del kit", agenti per-fase.
// Questa migrazione aggiunge le nuove sezioni a flow.config.json (senza toccare gli override
// esistenti) e verifica la coerenza della telemetria. Idempotente.

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  if (!config) {
    context.log('flow.config.json assente: nulla da migrare (esegui install).');
    return;
  }

  let changed = false;

  if (!config.documentation) {
    config.documentation = { docs: [] };
    context.log('aggiunta sezione "documentation" (registro documenti per la Fase 4 — censisci i doc con flow-settings).');
    changed = true;
  }
  if (!config.branching) {
    config.branching = { namePattern: '<fix|feat>/<nome-breve-esplicativo>' };
    context.log('aggiunta sezione "branching" (branch di lavoro obbligatorio, PR in Fase 5).');
    changed = true;
  }
  if (!config.perimeter) {
    config.perimeter = { enforce: true, allowedMcpServers: [], allowedSkills: [] };
    context.log('aggiunta sezione "perimeter" con enforce=true: nei progetti col kit si usano SOLO componenti del kit. Whitelist esplicite via flow-settings.');
    changed = true;
  }

  if (changed) {
    await context.writeJson('flow.config.json', config);
  } else {
    context.log('flow.config.json già allineato: nessuna modifica.');
  }

  // Coerenza telemetria (GAP-15): segnala se config e .envrc divergono (il fix è bin/telemetry.mjs).
  const envrc = (await context.readText('.envrc')) ?? '';
  const blockPresent = envrc.includes('# >>> ai-dev-flow telemetry >>>');
  const telemetryEnabled = Boolean(config.telemetry?.enabled);
  if (telemetryEnabled !== blockPresent) {
    context.log(`ATTENZIONE: telemetry.enabled=${telemetryEnabled} ma il blocco .envrc è ${blockPresent ? 'presente' : 'assente'}. Riallinea con: node "<kit>/bin/telemetry.mjs" --project . --${telemetryEnabled ? 'apply' : 'remove'}`);
  }
}
