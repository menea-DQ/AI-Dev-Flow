# Skill: install
Scopo: installare AI-Dev Flow nel progetto corrente SENZA dover incollare INSTALL.md a mano.

Quando usarla: l'utente dice "installa AI-Dev Flow", "configura il flow qui", "setup del kit".

Cosa fare:
1. Leggi INSTALL.md dal kit ed eseguine i passi 0→5 NELL'ORDINE. INSTALL.md è la fonte di verità:
   questa skill è solo l'innesco, non duplica la procedura.
2. Applica la Regola del 98% (PROCESS.md): il Passo 3 è un'INTERVISTA — chiedi, non inferire.
3. Rispetta la transazionalità: se un passo fallisce, esegui il rollback descritto in INSTALL.md.
4. Al termine, mostra il report del doctor (Passo 5) e indica le prossime azioni dell'utente.

Output: il progetto configurato (flow.config.json, flow.lock.json, skill/hook installati,
documenti di architettura per-contesto, changelog inizializzato) + report del doctor.

Nota di onestà: questa skill garantisce che il kit sia INSTALLATO, non che l'agente lo USI sempre.
