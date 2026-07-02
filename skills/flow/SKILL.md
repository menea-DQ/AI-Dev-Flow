---
name: flow
description: >
  ENTRYPOINT del processo AI-Dev Flow: guida un task (CR/BUG) attraverso le 6 fasi (intake →
  specifica → implementazione → qualità → documentazione → consegna) seguendo il sequencer
  deterministico dello stato per-task. Usa quando l'utente dice "lavora su questo ticket",
  "iniziamo il task <url/id>", "riprendi il task", "a che punto siamo col task", "abbandona il task".
---

# Skill: flow — l'orchestratore

Sei l'orchestratore del processo, ma NON decidi tu la sequenza: la sequenza è una funzione dei
FATTI registrati nello stato, e a calcolarla è il **sequencer deterministico**. Il tuo lavoro è un
loop semplice:

    1. node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" next
    2. esegui l'AZIONE che indica (delegando ai sub-agent il lavoro cognitivo,
       presentando TU i gate all'utente)
    3. registra il fatto col comando che `next` ti ha dato
    4. torna al punto 1 — finché `next` non dice di chiudere

Così il "qual è il prossimo passo" non dipende dalla tua memoria: è meccanico, quindi è codice
(regola d'oro). Gli hook restano i guardiani: se salti una registrazione, ti fermano loro.

## Avvio, ripresa, abbandono

- **Nuovo task**: `flowState.mjs start --task <connettore>-<id> --type <cr|bug> --connector <nome> --reference "<url-o-id>"`, poi entra nel loop.
- **Ripresa**: se SessionStart segnala un task attivo (o l'utente dice "riprendi"), NON ricostruire
  a memoria: chiama `next` e riparti da lì. Le fasi già registrate non si rifanno. Consiglio
  d'igiene: una sessione per fase — la ripresa è gratis, i contesti restano corti.
- **Abbandono** (decisione dell'utente, con motivo): `flowState.mjs abort --reason "<motivo>"` —
  chiude lo stato (resta come audit trail) ed elenca le **compensazioni** da proporre all'utente:
  eliminare il branch di lavoro, annotare il ticket via `--comment`, ripulire lo snapshot.

## Come eseguire le azioni che `next` indica

Il sequencer dice COSA; il COME delle fasi è questo:

- **F0 Intake** — contract-check (`connectors/check.mjs`), lettura ticket via connettore
  (+ helpdesk referenziato), normalizzazione col sub-agent **intake**. Niente codebase.
  Fast-path: solo candidatura.
- **F1 Specifica** — sub-agent **spec-author** (passagli: contesto richiesta, path architecture
  doc, constraint, changelog). Fai TU le domande sui buchi (registro Q&A) e presenta TU il
  GATE 1. Fast-path: se spec-author lo propone (post-retrieval; BUG: post-riproduzione), chiedi
  all'utente con AskUserQuestion spiegando cosa salta; se accetta:
  `record-override --gate fast-path --reason "<scelta utente>"`.
  RAMO BUG: prima della spec, riproduci il bug (caso minimo, changelog per l'origine).
- **F2 Piano/branch/test/codice** — piano al GATE 2; branch `<fix|feat>/<nome>` (chiedi base e
  nome); sub-agent **test-author** con SOLO la spec (committa i test — ramo BUG: il red-test);
  implementazione secondo impl-runbook; diff al GATE 3.
- **F3 Qualità** — skill test-selector (dal playbook, mai inventare) + sub-agent **test-runner**
  (comandi esatti + snapshot ref). Rossi → si torna all'implementazione; i test non si toccano.
- **F4 Documentazione** — sub-agent **doc-author** (spec, diff, registro
  flow.config.documentation.docs, architecture doc, changelog).
- **F5 Consegna** — PR (`gh pr create` se disponibile) e update del ticket via connettore
  (`--update-status`, stato scelto dall'utente).

## Regole trasversali

- Regola del 98% sempre; i 3 gate non si saltano MAI senza scelta esplicita dell'utente.
- I sub-agent preparano, TU presenti ai gate, l'utente decide, TU registri. Nessun gate delegato.
- Ogni skip/deroga passa da `record-override`/`--reason`: auditabile, mai silenziosa.
- Se un hook ti blocca, NON aggirarlo: fai ciò che l'istruzione del blocco dice.
- Perimetro: usa SOLO i componenti del kit — l'hook di perimetro blocca il resto.
- Se `next` sembra in disaccordo con la realtà (es. un fatto vero ma non registrato), NON forzare:
  registra il fatto mancante o segnala l'incoerenza all'utente.
