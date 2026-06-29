# Hook: on-tests-green
Evento: quando tutti i test selezionati passano.
Scopo: chiusura del task.

Logica:
- Avvia l'aggiornamento della documentazione.
- Scrivi nel changelog: cosa è stato fatto e PERCHÉ (la scelta e la motivazione). Append-only.
- Se la modifica ha cambiato struttura/invarianti di un contesto, aggiorna il documento di
  architettura di quel contesto (solo lo stato attuale; niente storia).
- Aggiorna lo stato del task nel ticketing (Done / Review) via connettore.
