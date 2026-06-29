# Hook: post-implementation
Evento: al termine dell'implementazione (dopo GATE UMANO 3).
Scopo: avviare la fase di qualità.

Logica:
- Cattura il diff rispetto allo stato pre-task.
- Invoca il test-selector (skill) passando il diff; il selettore consulta il test-playbook.
- Lancia SOLO i test selezionati (con i comandi dichiarati nel playbook).

Implementazione (Claude Code): la realizzazione deterministica è il gate sull'evento Stop
(scripts/postWorkVerification.mjs): a fine turno, se ci sono modifiche non committate che ricadono
nei pathPatterns del test-playbook, blocca e fa chiedere all'utente se eseguire la verifica.
Marcatore di sessione: /tmp/aidevflow-verify-<session>; guardia su stop_hook_active per non ripetersi.
Gli eventi on-spec-approved e on-tests-green NON hanno un evento nativo corrispondente: restano
agent-driven (l'agente li esegue al gate, come da PROCESS.md).
