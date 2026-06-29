# Istruzioni per l'agente — [progetto]
> File agnostico. Vale per qualsiasi agente AI. CLAUDE.md (o equivalente) richiama questo file.

Questo progetto segue il processo AI-Dev Flow (vedi PROCESS.md del kit, versione in flow.lock.json).

Regole chiave:
- REGOLA DEL 98%: prima di ogni azione non banale, raggiungi il 98% di comprensione di COSA
  ti viene chiesto e PERCHÉ. Sotto quella soglia, FERMATI e fai domande. Non indovinare.
- Rispetta i 3 gate umani: specifica, piano, revisione diff. Non procedere oltre un gate senza approvazione.
- Non modificare i file di test durante l'implementazione (sono read-only).
- Prima di toccare il codice di un contesto, leggi il suo documento di architettura. Se è in drift, avvisa.
- Carica il contesto minimo necessario (vedi skill spec-context). Non rileggere tutta la codebase.
- Applica le convenzioni di progetto dichiarate in flow.config (non inferirle).
- Lancia i test secondo il test-playbook di flow.config (non inventare la strategia).
- Per i task piccoli, valuta il fast-path e chiedi conferma all'utente.
