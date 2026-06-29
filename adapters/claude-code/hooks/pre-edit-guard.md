# Hook: pre-edit-guard
Evento: prima di ogni modifica a un file (pre-edit).
Scopo: impedire all'agente implementatore di modificare i file di test.

Logica:
- Se il file che si sta per modificare è nella cartella/pattern dei test (definito in flow.config:
  testPaths), BLOCCA la modifica.
- Eccezione: l'invocazione del sub-agent test-author è autorizzata a scrivere i test
  (riconosciuta da un marcatore di contesto/fase = "test-authoring").
- Messaggio di blocco: "I file di test sono read-only durante l'implementazione (anti
  teaching-to-the-test). Se un test è sbagliato rispetto alla spec, segnalalo all'utente."

Verificabile: il doctor testa questo hook provando a modificare un file di test fittizio.
