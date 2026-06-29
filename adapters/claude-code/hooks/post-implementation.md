# Hook: post-implementation
Evento: al termine dell'implementazione (dopo GATE UMANO 3).
Scopo: avviare la fase di qualità.

Logica:
- Cattura il diff rispetto allo stato pre-task.
- Invoca il test-selector (skill) passando il diff; il selettore consulta il test-playbook.
- Lancia SOLO i test selezionati (con i comandi dichiarati nel playbook).
