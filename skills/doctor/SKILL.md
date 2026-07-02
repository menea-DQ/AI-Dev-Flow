---
name: doctor
description: >
  Verifica di salute dell'installazione AI-Dev Flow nel progetto corrente: hook funzionanti,
  test-playbook non vuoto, architecture doc per contesto, connettori (contract-check), coerenza
  telemetria, stato dei task. Usa quando l'utente dice "doctor", "verifica il kit",
  "è tutto a posto col flow?", o dopo un install/migrate.
---

# Skill: doctor

Verifica che ogni elemento del processo abbia un corrispettivo reale e funzionante nel progetto.
È la stessa verifica del Passo 5 dell'install, invocabile in qualsiasi momento.

## Controlli da eseguire (tutti, nell'ordine)

1. **Artefatti base**: esistono `flow.config.json` e `flow.lock.json`? La `kitVersion` del lock
   coincide con la `VERSION` del plugin? (Se più vecchia → proponi la skill migrate.)
2. **Hook pre-edit-guard (test funzionale)**: crea un file fittizio che matcha
   `flow.config.testPaths` (es. `tests/aidevflow-doctor.test.js`) e PROVA a modificarlo con il
   tool Edit: DEVE essere bloccato. Poi prova a modificarlo via Bash (`echo x >> <file>`): DEVE
   essere bloccato anche lì (pre-bash-guard). Rimuovi il file fittizio (via Bash rm è consentito
   solo se il guard funziona? no: rimuovilo posando prima il marcatore test-authoring o segnala
   all'utente di rimuoverlo). Riporta l'esito di ENTRAMBI i vettori.
3. **Architecture doc**: per ogni contesto in `flow.config.architectureDocs.byContext`, il
   documento esiste? Segnala i mancanti.
4. **Test-playbook**: non vuoto? Ogni voce ha `command` e `pathPatterns`? Se vuoto: avvisa che il
   test-selector e il guardiano di fine turno non avranno regole.
5. **Registro documentazione**: `flow.config.documentation.docs` è popolato? Se vuoto: la Fase 4
   potrà valutare solo gli architecture doc; proponi di censire i documenti con flow-settings.
6. **Connettori (contract-check)**:
   `node "${CLAUDE_PLUGIN_ROOT}/connectors/check.mjs" --project "$(pwd)"` — riporta OK/AVVISO/ROTTO.
   Credenziali mancanti = AVVISO, non guasto.
7. **Telemetria (coerenza config ↔ attivazione)**: se `flow.config.telemetry.enabled` è `true`,
   il blocco `# >>> ai-dev-flow telemetry >>>` esiste in `.envrc`? Se `false`, NON deve esistere.
   Incoerenza = AVVISO con azione: `node "${CLAUDE_PLUGIN_ROOT}/bin/telemetry.mjs" --project "$(pwd)" --apply|--remove`.
8. **Perimetro**: `flow.config.perimeter.enforce` è `true`? Se `false`, segnala che il vincolo
   "solo componenti del kit" non è enforced (deroga consapevole del progetto?).
9. **Stato task**: se esiste `.ai-dev/tasks/ACTIVE`, lo stato puntato esiste ed è JSON valido?
   Riporta task e fase. Se il puntatore è orfano (stato mancante), proponi `flowState.mjs clear-active`.

## Report

Riporta a due livelli: un sommario (OK / AVVISO / ROTTO per area) e il dettaglio per ciò che non
è a posto, con l'azione correttiva concreta per ciascun punto.
Onestà: il doctor garantisce che i pezzi sono INSTALLATI e FUNZIONANTI, non che l'agente li usi —
per quello ci sono gli hook (che bloccano) e lo stato (che registra).
