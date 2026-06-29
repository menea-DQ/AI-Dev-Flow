---
name: uninstall
description: >
  Disinstalla AI-Dev Flow dal progetto corrente e ripulisce i file aggiunti dall'install
  (disabilita il plugin nel progetto, rimuove il blocco da CLAUDE.md, elimina gli artefatti).
  Usa quando l'utente dice "disinstalla AI-Dev Flow", "rimuovi il flow", "ripulisci il kit".
---

# Skill: uninstall

Rimuove AI-Dev Flow dal progetto corrente, ripulendo ciò che l'install aveva aggiunto.

## Cosa fare

1. Esegui l'uninstaller bundlato nel plugin (in `bin/uninstall.mjs`; percorso assoluto
   `${CLAUDE_PLUGIN_ROOT}/bin/uninstall.mjs`):

       node "<plugin>/bin/uninstall.mjs" --project "$(pwd)"

   Usa il manifest in `flow.lock.json` per rimuovere con precisione:
   - disabilita il plugin nel progetto (toglie `enabledPlugins` + `extraKnownMarketplaces` dal
     `.claude/settings.json`, lasciando intatte le altre impostazioni);
   - rimuove il blocco AI-Dev Flow da `CLAUDE.md` (preservando il resto del file);
   - elimina i file creati dall'install; `flow.lock.json` per ultimo;
   - rimuove le cartelle create se rimaste vuote.

2. **Sicurezza dei dati**: i file che possono contenere lavoro dell'utente — `flow.config.json`,
   `AGENT.md`, i documenti di architettura, il changelog — vengono rimossi SOLO se non sono stati
   modificati dopo l'install. Se l'utente li ha toccati, vengono **preservati** e segnalati.
   Per rimuovere TUTTO comunque, riproponi il comando con `--purge` (chiedi conferma prima).

3. Riporta all'utente cosa è stato rimosso e cosa preservato.

4. Passo opzionale a livello utente (NON per-progetto): per togliere anche la cache del marketplace
   dalla macchina, l'utente può eseguire lo slash command `/plugin marketplace remove ai-dev-flow`.
   Diglielo, ma non è necessario per disinstallare dal progetto.

Confine: questa skill ripulisce il PROGETTO. Non tocca il repo/plugin centrale.
