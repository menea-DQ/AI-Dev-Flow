---
name: intake-parser
description: >
  Normalizza una richiesta in ingresso (CR/BUG) in un "contesto richiesta" minimale.
  Usa in Fase 0 (Intake) di AI-Dev Flow, all'arrivo di un ticket dal ticketing/helpdesk.
  Per il flusso completo di un task usa la skill `flow` (che include questa fase).
---

# Skill: intake-parser

Scopo: normalizzare una richiesta in ingresso (CR/BUG) in un "contesto richiesta" minimale.

Quando usarla: Fase 0 (Intake), all'arrivo di un ticket. (La skill `flow` la include come prima
fase: se stai lavorando un task end-to-end, parti da `flow`.)

Cosa fare:
0. PRE-CONTROLLO (contract-check): prima di affidarti al connettore, esegui
   `node "${CLAUDE_PLUGIN_ROOT}/connectors/check.mjs" --project "$(pwd)"`. Se il connettore che ti
   serve risulta ROTTO (auth/API cambiata), avvisa subito l'utente e non procedere finché non è risolto.
1. Se il task non ha ancora uno stato, avvialo (rende il lavoro riprendibile e auditabile):
       node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" start --task <connettore>-<id> --type <cr|bug> --connector <nome> --reference "<url-o-id>"
2. Leggi il ticket usando il CONNETTORE configurato in flow.config.connectors (default già pronti:
   `productive` per il ticketing, `zammad` per l'helpdesk). NON chiedere quale tool usare e NON
   reimplementare nulla: esegui il connettore bundlato nel plugin, che stampa un JSON normalizzato:
       node "${CLAUDE_PLUGIN_ROOT}/connectors/<connector>.mjs" "<url-o-id>"
   Le credenziali stanno in .ai-dev/connectors.env (il connettore le carica da solo); se ne manca
   una, il connettore lo dice e tu giri il messaggio all'utente.
   Se un task di ticketing rimanda a un ticket di helpdesk (campo references), leggi anche quello.
3. Delega la normalizzazione al sub-agent **intake** (modello economico), passandogli i JSON:
   estrae tipo (CR/BUG), priorità, riferimenti, cliente, allegati; per i BUG segna se c'è una
   descrizione di riproduzione.
4. FAST-PATH — qui si valuta SOLO la CANDIDATURA, dai segnali del ticket (etichette, dimensione
   dichiarata). La PROPOSTA vera avviene in Fase 1, dopo il retrieval mirato (e per i BUG dopo la
   riproduzione): senza aver visto il codice non si può sapere quanto codice tocca la modifica.
5. NON leggere la codebase in questa fase. Produci solo il contesto richiesta.

Output: un oggetto richiesta sintetico (tipo, priorità, riferimenti, candidato-fast-path sì/no +
segnali) + stato del task avviato.
