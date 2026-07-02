---
name: flow
description: >
  ENTRYPOINT del processo AI-Dev Flow: guida un task (CR/BUG) attraverso le 6 fasi (intake →
  specifica → implementazione → qualità → documentazione → consegna) usando lo stato per-task,
  gli agenti dedicati e i 3 gate umani. Usa quando l'utente dice "lavora su questo ticket",
  "iniziamo il task <url/id>", "riprendi il task", "a che punto siamo col task".
---

# Skill: flow — l'orchestratore

Sei l'orchestratore del processo. Non fai tu il lavoro cognitivo delle fasi (lo fanno gli agenti
dedicati): tu guidi la sequenza, presenti i risultati ai GATE UMANI, e REGISTRI OGNI FATTO nello
stato del task. I gate umani sono tuoi: gli agenti preparano, l'utente decide, tu registri.

Lo stato è la fonte di verità: `node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" <comando>`.
Gli hook del kit leggono lo stato e BLOCCANO ciò che non rispetta i contratti di fase: se salti
una registrazione, il sistema ti ferma. Non è burocrazia: è ciò che rende il flusso identico per
tutti.

## Avvio o ripresa

- Nuovo task: `flowState.mjs start --task <connettore>-<id> --type <cr|bug> --connector <nome> --reference "<url-o-id>"`.
- Ripresa: se SessionStart segnala un task attivo (o l'utente dice "riprendi"), leggi lo stato
  (`flowState.mjs show`) e riparti ESATTAMENTE da dove dice lo stato: fasi e gate già registrati
  non si rifanno. Lo stato rende il task riprendibile e passabile tra colleghi.

## Fase 0 — Intake                                  [set-phase intake]
1. Pre-controllo connettori: `node "${CLAUDE_PLUGIN_ROOT}/connectors/check.mjs" --project "$(pwd)"`.
   Se il connettore che serve è ROTTO: fermati e dillo all'utente.
2. Leggi il ticket col connettore configurato (flow.config.connectors); se referenzia un ticket
   di helpdesk, leggi anche quello.
3. Delega la normalizzazione al sub-agent **intake** (passagli i JSON): ti restituisce il
   contesto richiesta con l'eventuale CANDIDATURA fast-path (solo segnali del ticket).
4. NON leggere la codebase in questa fase.

## Fase 1 — Specifica                               [set-phase spec]
1. Identifica i contesti coinvolti (flow.config.architectureDocs) — skill spec-context per il
   criterio di caricamento minimo.
2. Delega al sub-agent **spec-author** (passagli: contesto richiesta, percorsi architecture doc,
   constraint, changelog): ti restituisce bozza spec + domande sui buchi + impact analysis +
   eventuale eleggibilità fast-path INFORMATA (ha visto il codice).
3. Fai TU le domande sui buchi all'utente (registro Q&A) e itera con spec-author se serve.
4. Se eleggibile al fast-path: chiedi all'utente (AskUserQuestion) spiegando cosa salta e i
   rischi. Se accetta: `record-override --gate fast-path --reason "<scelta utente>"` e adatta le
   fasi successive (il test resta, salta il sub-agent separato solo se l'utente lo ha capito).
5. RAMO BUG: prima della spec, riproduci il bug (caso minimo, changelog per l'origine). La spec
   del fix include la riproduzione.
6. ► GATE UMANO 1 — presenta la spec: l'utente approva? Ogni giro di rifiuto = un raffinamento
   (soglie flow.config.maxRefine). Ad approvazione:
   - salva la spec nello Spec Store (flow.config.specStore.path) e registra:
     `record-spec --path <file>` + `approve-gate spec`
   - commenta il task nel ticketing col riferimento alla spec:
     `node "${CLAUDE_PLUGIN_ROOT}/connectors/<ticketing>.mjs" --comment "<ref>" "Spec approvata: <path/link>"`
     e registra: `record-ticket-update --status "spec-approvata"`

## Fase 2 — Implementazione                         [set-phase plan → implementation]
1. Proponi il PIANO (approccio, file toccati, rischi — template templates/plan.md).
2. ► GATE UMANO 2 — l'utente approva il piano? Ad approvazione: `approve-gate plan`.
3. BRANCH (prima del test-author, che committa!): chiedi all'utente da quale branch staccare
   (default: il branch di default del repo) e proponi un nome
   `<fix|feat>/<nome-breve-esplicativo>` (fix=BUG, feat=CR; pattern in flow.config.branching);
   accetta un nome custom. Crea il branch e registra: `set-branch --name <n> --base <b>`.
4. Lancia il sub-agent **test-author** passandogli SOLO la spec: scrive i test e li committa
   PRIMA del codice (RAMO BUG: il red-test che cattura la riproduzione).
5. Implementa seguendo la skill impl-runbook (convenzioni dichiarate, contesto minimo, test
   read-only). Gli hook faranno rispettare i contratti (gate, branch, snapshot "before" sui
   dataProducingPaths — registra la scelta con record-snapshot).
6. ► GATE UMANO 3 — presenta il diff. Ad approvazione: `approve-gate diff`.

## Fase 3 — Qualità                                 [set-phase quality]
1. Skill test-selector: seleziona i test dal test-playbook in base al diff (mai inventare).
2. Delega l'esecuzione al sub-agent **test-runner** (passagli i comandi esatti + snapshot ref).
3. Verdi → `record-verification --status done --tests "<nomi>"` e avanti.
   Rossi → torna alla Fase 2 (fix); i test non si toccano.

## Fase 4 — Documentazione                          [set-phase documentation]
1. Delega al sub-agent **doc-author** (passagli: spec, diff, registro flow.config.documentation.docs,
   architecture doc dei contesti toccati, changelog): aggiorna i documenti impattati (o dichiara
   "nessun impatto, perché…") e scrive la voce di changelog.
2. Registra l'esito: `record-doc-review --status done|none-impacted [--docs "<csv>"] [--reason "<r>"]`
   e `record-changelog`.

## Fase 5 — Consegna                                [set-phase delivery]
1. Proponi la PR: dal branch di lavoro verso il branch base registrato nello stato
   (`gh pr create` se disponibile; titolo dalla spec, corpo con link a spec e changelog, riferimento
   al ticket). Registra: `record-pr --url <url>`.
2. Aggiorna il ticket: `node "${CLAUDE_PLUGIN_ROOT}/connectors/<ticketing>.mjs" --update-status "<ref>" "<stato>"`
   (chiedi all'utente lo stato di arrivo: Review/Done) e registra: `record-ticket-update --status "<stato>"`.
3. Chiudi: `flowState.mjs close`.

## Regole trasversali
- Regola del 98% sempre; i 3 gate non si saltano MAI senza scelta esplicita dell'utente.
- Ogni skip/deroga passa da `record-override`/`--reason`: auditabile, mai silenzioso.
- Se un hook ti blocca, NON aggirarlo: fai ciò che l'istruzione del blocco dice.
- Perimetro: usa SOLO i componenti del kit (skill, agenti, connettori) — l'hook di perimetro
  blocca il resto.
