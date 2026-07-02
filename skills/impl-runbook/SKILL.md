---
name: impl-runbook
description: >
  Applica le convenzioni di implementazione del progetto dichiarate in flow.config
  (non le inferisce). Usa in Fase 2 di AI-Dev Flow, durante lo sviluppo del codice.
---

# Skill: impl-runbook

Scopo: applicare le convenzioni di implementazione del progetto.

Quando usarla: Fase 2, durante lo sviluppo software.

Cosa fare:
0. BRANCH DI LAVORO (prima di tutto, e prima che il test-author committi): lo sviluppo non
   avviene mai sul branch base. Se il branch non è ancora registrato nello stato del task, chiedi
   all'utente da quale branch staccare e proponi `<fix|feat>/<nome-breve-esplicativo>`
   (fix=BUG, feat=CR; pattern in flow.config.branching.namePattern), accettando un nome custom.
   Poi: git checkout -b <branch> e registra
   `node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" set-branch --name <branch> --base <base>`.
   (L'hook pre-edit-guard blocca la scrittura di sorgenti senza spec+piano approvati e branch.)
1. Rispetta le CONVENZIONI DI PROGETTO dichiarate in flow.config.projectConventions
   (naming, struttura, stile, regole UI, vincoli). Sono DICHIARATE, non da inferire.
   Se una convenzione manca per un caso che stai per decidere, applica la Regola del 98% e CHIEDI.
2. Contesto = spec approvata + piano approvato + documento di architettura del contesto.
   NON ricaricare tutta la repo.
3. NON modificare i file di test (sono read-only per te: li ha scritti il sub-agent test-author).
   Se ritieni che un test sia sbagliato rispetto alla spec, NON modificarlo: segnalalo all'utente.
4. Essenzialità via Ponytail: il plugin Ponytail (abilitato per-progetto dall'install quando
   flow.config.tokenEconomy.ponytail ≠ "off") inietta il ruleset che fa scrivere solo il codice
   necessario. All'inizio del lavoro allinea la modalità a flow.config con `/ponytail <modalità>`
   (lite|full|ultra). Principio comunque valido: riusa stdlib/feature native/dipendenze esistenti
   prima di aggiungere codice nuovo.
5. Al termine, prepara un diff chiaro per il GATE UMANO 3.

Output: l'implementazione + un diff leggibile.
