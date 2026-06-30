---
name: intake-parser
description: >
  Normalizza una richiesta in ingresso (CR/BUG) in un "contesto richiesta" minimale.
  Usa in Fase 0 (Intake) di AI-Dev Flow, all'arrivo di un ticket dal ticketing/helpdesk.
---

# Skill: intake-parser

Scopo: normalizzare una richiesta in ingresso (CR/BUG) in un "contesto richiesta" minimale.

Quando usarla: Fase 0 (Intake), all'arrivo di un ticket.

Cosa fare:
0. PRE-CONTROLLO (contract-check): prima di affidarti al connettore, esegui
   `node "${CLAUDE_PLUGIN_ROOT}/connectors/check.mjs" --project "$(pwd)"`. Se il connettore che ti
   serve risulta ROTTO (auth/API cambiata), avvisa subito l'utente e non procedere finché non è risolto.
1. Leggi il ticket usando il CONNETTORE configurato in flow.config.connectors (default già pronti:
   `productive` per il ticketing, `zammad` per l'helpdesk). NON chiedere quale tool usare e NON
   reimplementare nulla: esegui il connettore bundlato nel plugin, che stampa un JSON normalizzato:
       node "${CLAUDE_PLUGIN_ROOT}/connectors/<connector>.mjs" "<url-o-id>"
   Le credenziali stanno nelle variabili d'ambiente (vedi connectors/.env.example); se ne manca una,
   il connettore lo dice e tu giri il messaggio all'utente.
   Se un task di ticketing rimanda a un ticket di helpdesk (campo references), leggi anche quello.
2. Estrai: tipo (CR/evolutiva o BUG), priorità, riferimenti (ticket collegati, allegati), cliente.
3. Classifica CR vs BUG. Per i BUG, segna se c'è una descrizione di riproduzione.
4. Valuta fast-path-eligibility con criteri semplici e dichiarati:
   - modifica circoscritta a un singolo file/area, nessun cambiamento di schema dati,
     nessun impatto su API pubbliche, basso rischio.
   - Se eleggibile, segnalalo (NON decidere: la scelta è dell'utente, vedi PROCESS.md).
5. NON leggere la codebase in questa fase. Produci solo il contesto richiesta.

Output: un oggetto richiesta sintetico (tipo, priorità, riferimenti, fast-path-eligible sì/no + perché).
