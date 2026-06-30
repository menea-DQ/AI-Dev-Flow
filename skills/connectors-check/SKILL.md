---
name: connectors-check
description: >
  Verifica che i connettori configurati (ticketing/helpdesk) rispondano ancora come previsto
  (auth + raggiungibilità + contratto), segnalando rotture dovute a cambiamenti esterni.
  Usa quando l'utente dice "verifica i connettori", "controlla Productive/Zammad", "contract-check",
  o prima di iniziare un intake da ticket.
---

# Skill: connectors-check

Esegue il contract-check dei connettori configurati in `flow.config.connectors`, per intercettare
le rotture (token scaduto, API cambiata) PRIMA che blocchino il lavoro.

## Cosa fare

1. Esegui il runner bundlato nel plugin (`${CLAUDE_PLUGIN_ROOT}/connectors/check.mjs`):

       node "<plugin>/connectors/check.mjs" --project "$(pwd)"

   Fa il probe autenticato di ogni connettore configurato e riporta per ciascuno: OK / AVVISO / ROTTO.
   - `config-missing` (AVVISO): mancano le variabili d'ambiente (vedi connectors/.env.example) → non
     un guasto, ma il connettore non è utilizzabile finché non le imposti.
   - `auth-failed` / `drift` / `unreachable` / `contract-mismatch` (ROTTO): segnala all'utente cosa è
     rotto e perché; non procedere con l'intake da quel connettore finché non è risolto.
2. Per una verifica più profonda (anche della FORMA dell'output), passa un campione:

       node "<plugin>/connectors/check.mjs" --project "$(pwd)" --sample-ticketing "<url-o-id>" --sample-helpdesk "<url>"

   In questo caso valida l'output normalizzato contro `connectors/contract.schema.json`.
3. Riepiloga all'utente lo stato; se qualcosa è ROTTO, spiega l'azione correttiva (rinnova token,
   aggiorna il connettore, ecc.).

Quando usarlo in automatico: il doctor (INSTALL.md, Passo 5) e l'intake-parser lo eseguono come
pre-controllo. Exit code 1 = almeno un connettore rotto.
