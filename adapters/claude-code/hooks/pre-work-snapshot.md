# Hook: pre-work-snapshot
Evento: alla PRIMA modifica, nella sessione, di codice che produce/trasforma dati persistenti
(pattern definiti in flow.config: dataProducingPaths — es. cartelle di sync/ETL, schema del DB,
query che scrivono su tabelle).
Scopo: catturare lo stato "before" dei dati MENTRE il codice è ancora pristino, così che la
fase di qualità possa fare il confronto pre/post (data-diff) senza dover poi tornare indietro.

Logica:
- Blocca temporaneamente e CHIEDI all'utente (la cattura ha un costo): "Stai per modificare codice
  che produce dati. Vuoi catturare ORA lo snapshot 'before' (consigliato) o saltarlo?"
- Se l'utente accetta: cattura uno snapshot deterministico dei dati impattati (campione + hash,
  o tabelle-specchio), come definito dalla relativa voce del test-playbook. Non duplicare interi DB.
- Se l'utente salta: registralo; la fase di qualità avviserà che il pre/post non sarà disponibile.
- In entrambi i casi: scrivi il marcatore di sessione così il gate non riscatta sulla stessa sessione.

Nota di idempotenza: il marcatore è keyed sull'id-sessione (file nella cartella temporanea); un nuovo
intervento ri-arma il gate. Una guardia evita il rientro quando l'evento osservato è "fine turno".

Verificabile: il doctor controlla che, per i progetti con dataProducingPaths, il gate sia attivo.
