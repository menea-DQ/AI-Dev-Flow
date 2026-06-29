---
name: install
description: >
  Installa AI-Dev Flow nel progetto corrente (assessment, intervista di configurazione,
  scaffolding transazionale degli artefatti per-progetto). Usa quando l'utente dice
  "installa AI-Dev Flow", "configura il flow qui", "setup del kit", "aggancia AI-Dev Flow".
---

# Skill: install

Installa AI-Dev Flow nel progetto corrente, SENZA dover incollare INSTALL.md a mano.

Prerequisito: il plugin AI-Dev Flow è già abilitato in questo progetto (è il motivo per cui questa
skill è disponibile). L'abilitazione per-progetto avviene una volta sola con:

    /plugin marketplace add menea-DQ/AI-Dev-Flow
    /plugin install ai-dev-flow@ai-dev-flow --scope project

In alternativa, da una copia locale del kit, l'installer scrive lui stesso l'abilitazione
(`enabledPlugins` + `extraKnownMarketplaces`) nel `.claude/settings.json` del progetto.

## Cosa fare

1. Leggi `PROCESS.md` e `INSTALL.md` del plugin (radice del plugin).
2. Esegui la procedura di INSTALL.md NELL'ORDINE (passi 0→5).
   - Applica la Regola del 98%: il Passo 3 è un'INTERVISTA — chiedi, non inferire.
     Due cose non vanno MAI dedotte: la strategia di test (test-playbook) e le convenzioni di progetto.
3. Per le operazioni meccaniche del Passo 4, esegui l'installer deterministico che ship con il plugin
   (in `bin/install.mjs` alla radice del plugin; il percorso assoluto è `${CLAUDE_PLUGIN_ROOT}/bin/install.mjs`):

       node "<plugin>/bin/install.mjs" --project "$(pwd)" --decisions <file.json>

   dove <file.json> contiene le risposte raccolte nell'intervista (vedi formato sotto).
   Senza --decisions usa i default del template (e lo segnala).
4. L'installer è transazionale (rollback in caso di errore) e idempotente. Scaffolda gli artefatti
   PER-PROGETTO: flow.config.json, flow.lock.json, blocco in AGENT.md/CLAUDE.md, documenti di
   architettura per-contesto, changelog; e scrive l'abilitazione per-progetto del plugin.
5. Mostra il report del doctor (Passo 5): cosa è a posto, cosa manca, cosa richiede una decisione.

## Formato del file --decisions (opzionale)

```json
{
  "installedAt": "<timestamp ISO>",
  "config": { "...": "override di qualsiasi chiave di flow.config (testPlaybook, projectConventions, dataProducingPaths, connectors, ...)" },
  "architectureContexts": ["contesto-a", "contesto-b"]
}
```

Onestà: questa skill garantisce che il kit sia INSTALLATO nel progetto, non che l'agente lo USI sempre.
