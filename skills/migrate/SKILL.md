---
name: migrate
description: >
  Aggiorna gli artefatti per-progetto di AI-Dev Flow alla versione corrente del kit, trasformando
  i dati dal vecchio al nuovo formato (idempotente, transazionale). Usa quando l'utente dice
  "aggiorna il kit", "migra AI-Dev Flow", "porta il progetto alla nuova versione", o quando il
  drift-notice di inizio sessione segnala una versione installata più vecchia.
---

# Skill: migrate

Porta il progetto corrente dalla versione del kit installata (in `flow.lock.json`) a quella corrente,
applicando le migrazioni di formato necessarie.

## Cosa fare

1. Esegui l'engine bundlato nel plugin (`${CLAUDE_PLUGIN_ROOT}/bin/migrate.mjs`):

       node "<plugin>/bin/migrate.mjs" --project "$(pwd)"

   - Idempotente: se il progetto è già alla versione corrente, non fa nulla.
   - Transazionale: a errore ripristina lo stato precedente (rollback).
   - Applica in ordine le migrazioni in `migrations/`; le versioni senza cambi di formato sono
     semplici bump del lockfile.
   - Non esegue downgrade.
2. Riporta all'utente da/a quale versione è migrato e cosa è cambiato.

Nota: la migrazione è **per-progetto**. "Su tutti i progetti" avviene man mano che ciascuno viene
aperto: il drift-notice di inizio sessione ricorda di eseguire `migrate` dove la versione è vecchia.
