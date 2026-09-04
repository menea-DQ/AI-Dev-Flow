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
   - `branching`: il pattern del nome branch (`namePattern`, default `<fix|feat>/<slug>`) e, per i
     progetti SENZA git, le radici e le esclusioni del manifest "prima" (`manifestPaths`,
     `manifestExclude`) da cui si ricava l'inventario del GATE 3 per confronto.
   - `perimeter`: `enforce` + whitelist esplicite (`allowedMcpServers`, `allowedSkills`).
     Whitelistare un componente esterno è una DECISIONE DELL'UTENTE, committata: mai farlo di
     iniziativa.
   - `models`: il tier del THREAD PRINCIPALE (`mainThread`: orchestrazione + implementazione), il
     tier di `escalation` e dopo quanti giri rossi il sequencer la propone
     (`escalateAfterRedRounds`; 0 = mai). NON governa i sub-agent: il loro tier sta nel frontmatter
     dell'agente e si cambia aggiornando il kit, non da qui.
   - `output`: `style` = `"kit"` (stile "AI-Dev Flow": output essenziale nel flusso, domande e gate
     completi), `"inherit"` (non tocca lo stile del progetto), o il nome di un altro stile.
   - `delivery`: quali passi di consegna il sequencer pretende in questo progetto —
     `specTicketComment` (commento sul ticket a spec approvata), `pr` (proposta di PR in Fase 5),
     `ticketUpdate` (update di stato del ticket alla consegna), `ticketStatus` (lo stato di
     arrivo di default, es. "Review": se valorizzato, alla consegna non si chiede). Metterli a
     `false` (o valorizzare `ticketStatus`) è la forma giusta di una scelta STABILE del progetto:
     se l'utente sta derogando lo stesso passo — o rispondendo sempre la stessa cosa — a ogni
     task, proponigli di fissarlo qui (decisione committata, non deroga ripetuta).
   - `fastPath`: `maxFiles` (file previsti entro cui il fast-path è la proposta di default, default 3),
     `thresholdLines` (indizio secondario sul diff atteso), `askEachTime`, `autoUnderThreshold`.
   - `maxRefine`, `connectors`, `tokenEconomy`: soglie e opzioni.
3. Valida la modifica contro lo schema di `flow.config`. Se una scelta è ambigua, applica la
   Regola del 98% e CHIEDI; non indovinare.
4. Scrivi SOLO `flow.config.json`. NON toccare mai il core del kit (il plugin), né gli artefatti di
   lavoro (spec/changelog), né i file di test.
4-bis. ECCEZIONE TELEMETRIA: `flow.config.telemetry` è solo la sorgente di intento — ciò che
   attiva l'OTEL sono i blocchi in `.envrc` e `.claude/settings.json`. Quando tocchi
   `telemetry.*`, DOPO aver salvato la config riallinea i blocchi:
       node "${CLAUDE_PLUGIN_ROOT}/bin/telemetry.mjs" --project "$(pwd)" --apply
   (con `enabled=false` usa `--remove`). Altrimenti config e realtà divergono.
4-ter. ECCEZIONE TIER DEL THREAD: come per la telemetria, `flow.config.models.mainThread` è solo
   l'intento — ciò che lo applica è `"model"` in `.claude/settings.json`. Quando lo cambi, dopo aver
   salvato la config allinea a mano quella chiave nello stesso giro (o rimuovila, se il valore è
   `"inherit"`), e dillo all'utente: il nuovo default vale dalla prossima sessione, quella in corso
   la cambia lui con `/model`. Il tier dei sub-agent NON si tocca da qui.
4-quater. ECCEZIONE STILE DI OUTPUT: stessa meccanica. `flow.config.output.style` è l'intento; ciò
   che lo applica è `"outputStyle"` in `.claude/settings.json`, e il valore per lo stile del kit è il
   nome NAMESPACED `ai-dev-flow:AI-Dev Flow` (il nome nudo non viene trovato: lo stile è consegnato
   dal plugin). Con `"inherit"` la chiave va rimossa. Vale dalla prossima sessione.
5. Mostra un diff prima di salvare e chiedi conferma. Riepiloga l'effetto pratico della modifica
   (es. "d'ora in poi le modifiche ai file *.sql faranno scattare il data-diff").

## Confine netto

Questa skill governa la CONFIGURAZIONE del progetto, non il PROCESSO del kit.
Il processo si cambia aggiornando il plugin (e la sua versione), non da qui.
