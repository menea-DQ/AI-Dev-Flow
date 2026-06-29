# Skill: intake-parser
Scopo: normalizzare una richiesta in ingresso (CR/BUG) in un "contesto richiesta" minimale.

Quando usarla: Fase 0 (Intake), all'arrivo di un ticket.

Cosa fare:
1. Leggi il ticket dal connettore di ticketing (NON le credenziali: usa il connettore).
2. Estrai: tipo (CR/evolutiva o BUG), priorità, riferimenti (ticket collegati, allegati), cliente.
3. Classifica CR vs BUG. Per i BUG, segna se c'è una descrizione di riproduzione.
4. Valuta fast-path-eligibility con criteri semplici e dichiarati:
   - modifica circoscritta a un singolo file/area, nessun cambiamento di schema dati,
     nessun impatto su API pubbliche, basso rischio.
   - Se eleggibile, segnalalo (NON decidere: la scelta è dell'utente, vedi PROCESS.md).
5. NON leggere la codebase in questa fase. Produci solo il contesto richiesta.

Output: un oggetto richiesta sintetico (tipo, priorità, riferimenti, fast-path-eligible sì/no + perché).
