---
name: flow-settings
description: >
  Modifica guidata delle impostazioni per-progetto di AI-Dev Flow (flow.config.json):
  strategia di test, convenzioni di progetto, soglie, connettori, documenti di architettura.
  Usa quando l'utente dice "cambia come si fanno i test", "aggiorna le impostazioni del flow",
  "aggiungi una convenzione di progetto", "modifica le soglie", "cambia connettore".
---

# Skill: flow-settings

Modifica le impostazioni per-progetto del kit (`flow.config.json` nella radice del progetto),
senza che l'utente debba editare il JSON a mano.

## Cosa fare

1. Leggi il `flow.config.json` corrente del progetto. Mostra all'utente la sezione pertinente.
2. Chiedi cosa vuole cambiare. Aree modificabili:
   - `testPlaybook`: aggiungi/modifica/rimuovi un tipo di test (`command`, `appliesWhen`,
     `pathPatterns` per il matching deterministico degli hook, `needsBeforeSnapshot`).
   - `projectConventions`: aggiungi/modifica una convenzione o preferenza ("suggerimento di progetto"
     che l'impl-runbook applicherà), o il puntatore a un documento sorgente.
   - `architectureDocs`: registra/diregistra un contesto e il path del suo documento di architettura.
   - `dataProducingPaths`: i pattern che armano il gate pre-work-snapshot.
   - `documentation.docs`: il registro dei documenti di progetto (percorso + descrizione
     dell'AMBITO di ciascuno) che il doc-author valuta in Fase 4.
   - `branching`: il pattern del nome branch (`namePattern`, default `<fix|feat>/<slug>`).
   - `perimeter`: `enforce` + whitelist esplicite (`allowedMcpServers`, `allowedSkills`).
     Whitelistare un componente esterno è una DECISIONE DELL'UTENTE, committata: mai farlo di
     iniziativa.
   - `maxRefine`, `fastPath`, `connectors`, `tokenEconomy`: soglie e opzioni.
3. Valida la modifica contro lo schema di `flow.config`. Se una scelta è ambigua, applica la
   Regola del 98% e CHIEDI; non indovinare.
4. Scrivi SOLO `flow.config.json`. NON toccare mai il core del kit (il plugin), né gli artefatti di
   lavoro (spec/changelog), né i file di test.
4-bis. ECCEZIONE TELEMETRIA: `flow.config.telemetry` è solo la sorgente di intento — ciò che
   attiva l'OTEL sono i blocchi in `.envrc` e `.claude/settings.json`. Quando tocchi
   `telemetry.*`, DOPO aver salvato la config riallinea i blocchi:
       node "${CLAUDE_PLUGIN_ROOT}/bin/telemetry.mjs" --project "$(pwd)" --apply
   (con `enabled=false` usa `--remove`). Altrimenti config e realtà divergono.
5. Mostra un diff prima di salvare e chiedi conferma. Riepiloga l'effetto pratico della modifica
   (es. "d'ora in poi le modifiche ai file *.sql faranno scattare il data-diff").

## Confine netto

Questa skill governa la CONFIGURAZIONE del progetto, non il PROCESSO del kit.
Il processo si cambia aggiornando il plugin (e la sua versione), non da qui.
