# Skill: impl-runbook
Scopo: applicare le convenzioni di implementazione del progetto.

Quando usarla: Fase 2, durante lo sviluppo software.

Cosa fare:
1. Rispetta le CONVENZIONI DI PROGETTO dichiarate in flow.config.projectConventions
   (naming, struttura, stile, regole UI, vincoli). Sono DICHIARATE, non da inferire.
   Se una convenzione manca per un caso che stai per decidere, applica la Regola del 98% e CHIEDI.
2. Contesto = spec approvata + piano approvato + documento di architettura del contesto.
   NON ricaricare tutta la repo.
3. NON modificare i file di test (sono read-only per te: li ha scritti il sub-agent test-author).
   Se ritieni che un test sia sbagliato rispetto alla spec, NON modificarlo: segnalalo all'utente.
4. Applica il principio di essenzialità (Ponytail, se attivo): scrivi solo il codice necessario,
   riusa stdlib/feature native/dipendenze esistenti prima di aggiungere codice nuovo.
5. Al termine, prepara un diff chiaro per il GATE UMANO 3.

Output: l'implementazione + un diff leggibile.
