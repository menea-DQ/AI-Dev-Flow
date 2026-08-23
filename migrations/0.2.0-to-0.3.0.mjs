// Migrazione 0.2.0 → 0.3.0
// La 0.3.0 dichiara il TIER DEI MODELLI anche per il thread principale (orchestrazione +
// implementazione), che fino alla 0.2.0 era quello della sessione dell'utente — cioè un fatto
// incidentale, non una scelta del progetto. Da qui:
//   • flow.config acquista il blocco `models`: tier del thread, tier di escalation e dopo quanti
//     giri rossi il sequencer propone l'escalation;
//   • .claude/settings.json acquista `model` (il default del progetto), se il progetto non ne ha
//     già uno scelto a mano: il valore esistente NON si sovrascrive in una migrazione.
// Idempotente.

const DEFAULT_MODELS = { mainThread: 'sonnet', escalation: 'opus', escalateAfterRedRounds: 2 };

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  if (!config) {
    context.log('flow.config.json assente: nulla da migrare (esegui install).');
    return;
  }

  if (config.models && typeof config.models === 'object') {
    context.log('flow.config.models già presente: non lo tocco.');
  } else {
    config.models = { ...DEFAULT_MODELS };
    await context.writeJson('flow.config.json', config);
    context.log(`models: aggiunto (thread principale "${DEFAULT_MODELS.mainThread}", escalation "${DEFAULT_MODELS.escalation}" dopo ${DEFAULT_MODELS.escalateAfterRedRounds} giri rossi — regolabili con flow-settings).`);
  }

  // ————— .claude/settings.json: default del thread per questo progetto —————
  const requested = config.models?.mainThread ?? DEFAULT_MODELS.mainThread;
  if (!requested || requested === 'inherit') {
    context.log('models.mainThread = "inherit": nessun default di progetto da scrivere in .claude/settings.json.');
    return;
  }
  const settings = await context.readJson('.claude/settings.json');
  if (!settings) {
    context.log('.claude/settings.json assente: il tier del thread verrà scritto al prossimo install.');
    return;
  }
  if (settings.model === requested) {
    context.log(`.claude/settings.json già su "model": "${requested}": nessuna modifica.`);
    return;
  }
  if (settings.model) {
    context.log(`ATTENZIONE: .claude/settings.json ha già "model": "${settings.model}" — una migrazione non sovrascrive una scelta esplicita. Se vuoi il default del kit, portalo a "${requested}" a mano (o allinea flow.config.models.mainThread al valore che usi).`);
    return;
  }
  settings.model = requested;
  await context.writeJson('.claude/settings.json', settings);
  context.log(`.claude/settings.json: "model": "${requested}" (default di progetto per il thread principale; i sub-agent restano sul tier del loro frontmatter). Sovrascrivibile in sessione con /model.`);
}
