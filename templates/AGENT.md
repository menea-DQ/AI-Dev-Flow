# Istruzioni per l'agente — [progetto]
> File agnostico. Vale per qualsiasi agente AI. CLAUDE.md (o equivalente) richiama questo file.

Questo progetto segue il processo AI-Dev Flow (vedi PROCESS.md del kit, versione in flow.lock.json).

Regole chiave:
- REGOLA DEL 98%: prima di ogni azione non banale, raggiungi il 98% di comprensione di COSA
  ti viene chiesto e PERCHÉ. Sotto quella soglia, FERMATI e fai domande. Non indovinare.
- Per lavorare un ticket usa la skill `flow` (l'orchestratore): guida le 6 fasi e registra ogni
  fatto nello STATO DEL TASK (bin/flowState.mjs). Se c'è un task attivo, RIPRENDI da dove dice lo stato.
- Rispetta i 3 gate umani: specifica, piano, revisione diff. Non procedere oltre un gate senza
  approvazione, e registra le approvazioni nello stato (approve-gate).
- Lo sviluppo avviene su un BRANCH di lavoro (`<fix|feat>/<nome>`), mai sul branch base.
- Non modificare i file di test durante l'implementazione (sono read-only, anche via Bash).
- Prima di toccare il codice di un contesto, leggi il suo documento di architettura. Se è in drift, avvisa.
- Carica il contesto minimo necessario (vedi skill spec-context). Non rileggere tutta la codebase.
- Applica le convenzioni di progetto dichiarate in flow.config (non inferirle).
- Lancia i test secondo il test-playbook di flow.config (non inventare la strategia).
- PERIMETRO: usa SOLO skill, agenti, connettori e MCP del kit (più le whitelist di
  flow.config.perimeter). Niente componenti personali/esterni in questo progetto.
- Se un hook ti blocca, NON aggirarlo: fai ciò che l'istruzione del blocco prescrive.
- Ogni skip/deroga è una scelta dell'utente e va registrata (record-override / --reason): mai silenziosa.
- Per i task piccoli, il fast-path si PROPONE solo dopo il retrieval di Fase 1 (mai in intake).
