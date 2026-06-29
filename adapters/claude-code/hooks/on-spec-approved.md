# Hook: on-spec-approved
Evento: quando la persona approva la specifica (GATE UMANO 1).
Scopo: rendere persistente la spec approvata.

Logica:
- Salva la spec finale nello Spec Store (posizione da flow.config: stesso repo o repo dedicato).
- Fai un commit della spec (git) — il timestamp serve come prova dell'ordine temporale.
- Aggiorna il task nel ticketing con il riferimento alla spec (via connettore).
