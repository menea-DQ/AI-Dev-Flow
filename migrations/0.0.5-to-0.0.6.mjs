// Migrazione 0.0.5 → 0.0.6
// I connettori ora CARICANO le credenziali da un file env del progetto (flow.config.connectors.envFile,
// default .ai-dev/connectors.env) invece di leggere solo process.env. Questa migrazione predispone quel
// file (template, da compilare) se assente e lo rende gitignorato. Idempotente.

import { basename, dirname, join } from 'node:path';

const TEMPLATE = [
  '# Credenziali dei connettori AI-Dev Flow. Compila i valori. NON committare i segreti (gitignorato).',
  '',
  '# Productive (ticketing)',
  'PRODUCTIVE_API_TOKEN=',
  'PRODUCTIVE_ORG_ID=',
  '',
  '# Zammad (helpdesk)',
  'ZAMMAD_API_TOKEN=',
  'ZAMMAD_BASE_URL=',
  'ZAMMAD_CF_AUTHORIZATION=',
  '',
].join('\n');

export default async function up(context) {
  const config = await context.readJson('flow.config.json');
  const envFileRelativePath = config?.connectors?.envFile ?? '.ai-dev/connectors.env';

  if ((await context.readText(envFileRelativePath)) === null) {
    await context.writeText(envFileRelativePath, TEMPLATE);
    context.log(`creato ${envFileRelativePath} (template credenziali — compilalo). Le credenziali messe altrove vanno spostate qui.`);
  }

  const ignoreEntry = basename(envFileRelativePath);
  const gitignoreRelativePath = join(dirname(envFileRelativePath), '.gitignore');
  const existingGitignore = (await context.readText(gitignoreRelativePath)) ?? '';
  if (!existingGitignore.includes(ignoreEntry)) {
    const next = existingGitignore.trim() === '' ? `${ignoreEntry}\n` : `${existingGitignore.replace(/\n*$/, '')}\n${ignoreEntry}\n`;
    await context.writeText(gitignoreRelativePath, next);
    context.log(`${ignoreEntry} aggiunto a ${gitignoreRelativePath}`);
  }
}
