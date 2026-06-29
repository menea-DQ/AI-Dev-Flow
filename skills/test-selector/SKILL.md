---
name: test-selector
description: >
  Sceglie QUALI test lanciare in base a cosa è cambiato, consultando il test-playbook del
  progetto (non inventa la strategia). Usa in Fase 3 (Qualità) di AI-Dev Flow, dopo l'implementazione.
---

# Skill: test-selector

Scopo: scegliere QUALI test lanciare in base a cosa è cambiato (risparmio + qualità).

Quando usarla: Fase 3 (Qualità), dopo l'implementazione.

Cosa fare:
1. Classifica il diff per area: dati/ETL, frontend, API/logica, trasversale.
2. Consulta il TEST-PLAYBOOK del progetto (flow.config.testPlaybook). Per ogni tipo di test
   il playbook dichiara: il comando per lanciarlo e la condizione che lo rende applicabile.
   USA il playbook: NON inventare la strategia e NON dedurla dal codice.
   - Se il diff ricade in un'area senza regola nel playbook, AVVISA l'utente e proponi di
     aggiungerne una con la skill flow-settings (anziché tirare a indovinare).
3. Categorie generiche di default, se il playbook non le sovrascrive:
   - dati/ETL → non-regression a confronto pre/post (data-diff su invarianti).
   - frontend → end-to-end.
   - API/logica → unit + integration.
   - trasversale → combinazione.
   - validazione-spec → sempre (è leggera).
4. SU MONOREPO: NON costruire tu il grafo delle dipendenze. Interroga il tool nativo:
   - Turborepo: usa il calcolo --affected con base = stato pre-task.
   - Nx: usa nx affected.
   - Se non c'è affected-detection: FALLBACK conservativo (lancia tutta la suite dell'ambito
     coinvolto) e AVVISA che la selezione fine non è disponibile.
5. Requisito: serve una base git pulita o uno stato pre-task catturato. Per i test pre/post sui
   dati, lo stato "before" è quello catturato dal gate pre-work-snapshot.

Output: l'elenco mirato dei test da eseguire (con i comandi dal playbook) + motivazione.
