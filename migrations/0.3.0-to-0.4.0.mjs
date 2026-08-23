// Migrazione 0.3.0 → 0.4.0
// La 0.4.0 tratta l'ATTENZIONE dell'utente come una risorsa, come già fa coi token: output
// essenziale mentre il flusso gira, domande e gate completi quando serve decidere. Il veicolo è un
// OUTPUT STYLE consegnato dal plugin (non copiato nei progetti), selezionato per-progetto:
//   • flow.config acquista `output.style` ("kit" = lo stile del kit, "inherit" = non toccare nulla);
//   • .claude/settings.json acquista `outputStyle` col nome NAMESPACED dello stile, se il progetto
//     non ne ha già uno scelto a mano: un valore esistente NON si sovrascrive in una migrazione.
// Idempotente.

const KIT_OUTPUT_STYLE = 'ai-dev-flow:AI-Dev Flow';

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  if (!config) {
    context.log('flow.config.json assente: nulla da migrare (esegui install).');
    return;
  }

  if (config.output && typeof config.output === 'object') {
    context.log('flow.config.output già presente: non lo tocco.');
  } else {
    config.output = { style: 'kit' };
    await context.writeJson('flow.config.json', config);
    context.log('output: aggiunto (style "kit" — output essenziale nel flusso, domande complete ai gate; "inherit" per non toccare lo stile del progetto).');
  }

  const requested = config.output?.style ?? 'kit';
  if (!requested || requested === 'inherit') {
    context.log('output.style = "inherit": nessuno stile da selezionare in .claude/settings.json.');
    return;
  }
  const styleName = requested === 'kit' ? KIT_OUTPUT_STYLE : requested;

  const settings = await context.readJson('.claude/settings.json');
  if (!settings) {
    context.log('.claude/settings.json assente: lo stile verrà selezionato al prossimo install.');
    return;
  }
  if (settings.outputStyle === styleName) {
    context.log(`.claude/settings.json già su "outputStyle": "${styleName}": nessuna modifica.`);
    return;
  }
  if (settings.outputStyle) {
    context.log(`ATTENZIONE: .claude/settings.json ha già "outputStyle": "${settings.outputStyle}" — una migrazione non sovrascrive una scelta esplicita. Se vuoi lo stile del kit, portalo a "${styleName}" a mano (o allinea flow.config.output.style).`);
    return;
  }
  settings.outputStyle = styleName;
  await context.writeJson('.claude/settings.json', settings);
  context.log(`.claude/settings.json: "outputStyle": "${styleName}". Vale dalla prossima sessione; lo stile vive nel plugin, non è stato copiato nel progetto.`);
}
