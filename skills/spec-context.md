# Skill: spec-context
Scopo: decidere COSA caricare per definire la specifica, senza leggere tutta la codebase.

Quando usarla: Fase 1, prima di redigere la specifica.

Cosa fare:
1. Dal contesto richiesta, identifica le aree/contesti probabilmente coinvolti.
2. Per ogni contesto coinvolto, LEGGI PRIMA il suo documento di architettura (registrato in
   flow.config.architectureDocs). È la mappa che dice cosa fa il contesto e dove si tocca in sicurezza.
   - Se il documento è in drift rispetto al codice che leggi dopo, SEGNALALO subito all'utente.
3. Usa la ricerca mirata (indice della codebase via connettore, se presente) per individuare
   SOLO i file rilevanti. Preferisci pochi file giusti a molti file generici.
4. Carica: i file individuati, i constraint di progetto (da flow.config), e le voci di changelog
   pertinenti all'area.
5. Su monorepo: limita il contesto al contesto coinvolto, non all'intero workspace.

Principio di risparmio: il costo maggiore è rileggere tutto. Carica il minimo sufficiente.
Se non sei sicuro che un file serva, NON caricarlo: chiedilo nell'intervista invece.

Output: il set minimo di contesto su cui costruire la specifica.
