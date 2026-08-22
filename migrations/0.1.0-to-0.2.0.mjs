// Migrazione 0.1.0 → 0.2.0
// La 0.2.0 cambia la forma di due artefatti per-progetto:
//   • il CHANGELOG acquista una testa "Vincolante" breve (l'unica parte che le fasi successive
//     rileggono) sopra la narrativa: è ciò che rende il costo di un task indipendente dal numero
//     di task già svolti;
//   • flow.config.branching acquista le radici/esclusioni del manifest "prima" (inventario del
//     GATE 3 per confronto, nei progetti senza git).
// Le VOCI DI CHANGELOG GIÀ SCRITTE non vengono riscritte: restano valide nel formato vecchio, la
// nuova forma vale per le voci nuove. Idempotente.

const OLD_CHANGELOG_INSTRUCTION = '> Append-only. Ogni voce registra COSA è stato fatto e PERCHÉ.';

const NEW_CHANGELOG_INSTRUCTION = [
  '> Append-only. Ogni voce ha due parti: una TESTA "Vincolante" breve (max 15 righe: è l\'unica',
  '> che le fasi successive leggono) e una NARRATIVA sotto la barriera di lettura (la memoria del',
  '> progetto: si scrive sempre, non si rilegge per intero). Formato in templates/changelog.md.',
].join('\n');

export default async function up(context) {
  // ————— 1) flow.config.json: manifest "prima" —————
  const config = await context.readJson('flow.config.json');
  if (!config) {
    context.log('flow.config.json assente: nulla da migrare (esegui install).');
  } else {
    config.branching ??= { namePattern: '<fix|feat>/<nome-breve-esplicativo>' };
    let changed = false;
    if (!Array.isArray(config.branching.manifestPaths)) {
      config.branching.manifestPaths = ['.'];
      changed = true;
    }
    if (!Array.isArray(config.branching.manifestExclude)) {
      config.branching.manifestExclude = ['.git/**', 'node_modules/**', '.ai-dev/tasks/**', 'dist/**', 'build/**', 'coverage/**', '**/.DS_Store', '**/*.log'];
      changed = true;
    }
    if (changed) {
      await context.writeJson('flow.config.json', config);
      context.log('branching: aggiunte manifestPaths/manifestExclude (inventario del GATE 3 per confronto nei progetti senza git — regolabili con flow-settings).');
    } else {
      context.log('branching già allineato: nessuna modifica.');
    }
  }

  // ————— 2) changelog: istruzioni del nuovo formato in testa —————
  const changelogRelativePath = config?.changelog?.path ?? '.ai-dev/changelog.md';
  const changelog = await context.readText(changelogRelativePath);
  if (changelog === null) {
    context.log(`${changelogRelativePath} assente: nessun changelog da allineare.`);
    return;
  }
  if (changelog.includes('### Vincolante') || changelog.includes('TESTA "Vincolante"')) {
    context.log('changelog già nel formato a due parti: nessuna modifica.');
    return;
  }
  if (!changelog.includes(OLD_CHANGELOG_INSTRUCTION)) {
    context.log(`ATTENZIONE: ${changelogRelativePath} ha un'intestazione personalizzata: non la tocco. Allinea a mano al formato a due parti (testa "Vincolante" + narrativa) di templates/changelog.md.`);
    return;
  }
  const migratedAt = new Date().toISOString().slice(0, 10);
  await context.writeText(
    changelogRelativePath,
    changelog.replace(
      OLD_CHANGELOG_INSTRUCTION,
      `${NEW_CHANGELOG_INSTRUCTION}\n> Le voci precedenti al ${migratedAt} sono nel formato a una sola parte: restano valide così.`,
    ),
  );
  context.log(`${changelogRelativePath}: intestazione portata al formato a due parti (le voci già scritte non sono state toccate).`);
}
