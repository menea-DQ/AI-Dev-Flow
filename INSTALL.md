# AI-Dev Flow — Procedura di installazione

Sei l'installatore di AI-Dev Flow. Segui questi passi NELL'ORDINE.
Non saltare la verifica. Non creare nulla prima del passo 4.
Applica la Regola del 98% (PROCESS.md): davanti a un'ambiguità reale, fermati e chiedi.

## Passo 0 — Leggi il processo
Leggi PROCESS.md per intero. È il processo che stai per installare.

## Passo 1 — Assessment (SOLO lettura, budget limitato)
NON leggere il contenuto dei file sorgente. Leggi solo:
- I manifest: package.json, turbo.json / nx.json se presenti, tsconfig, ecc.
- La struttura delle cartelle top-level (per capire se è monorepo e quanti contesti).
- Esistenza (non contenuto) di: CLAUDE.md, AGENT.md, documenti di architettura, una cartella
  di documentazione, un changelog, una cartella di test, una config di test runner.
- Connettori MCP configurati a livello utente.
ESCLUDI esplicitamente .env, file di segreti, credenziali. Non leggerli mai.
Determina: progetto NUOVO (vuoto/scaffold) o ESISTENTE; e l'elenco dei CONTESTI
(in un monorepo, un contesto per app/pacchetto/servizio; in un single-repo, un contesto solo).

## Passo 2 — Report (a due livelli)
Mostra prima un SOMMARIO di max 5 righe: cosa farò, cosa mi serve da te.
Poi, espandibile, il dettaglio di cosa ho trovato (incluso l'elenco dei contesti rilevati).
Evidenzia e NUMERA le decisioni che richiedono il tuo input, separate dalle informazioni.

## Passo 3 — Intervista di configurazione (CHIEDI, non inferire)
Questo è un passo di INTERVISTA, non di inferenza. Per ogni decisione proponi un default
consigliato, ma CHIEDI conferma: non dedurre dal progetto né inventare. In particolare,
DUE cose non vanno MAI inferite — vanno sempre chieste:
  • la strategia di test (il test-playbook), e
  • le convenzioni/preferenze di progetto.
Decisioni dell'intervista:
- Spec/changelog: dove vivono — (a) stesso repo del codice [DEFAULT], (b) repo separato dedicato.
  Se (b), chiedi il link al repo.
- Documentazione: esiste? altrimenti propongo una cartella docs/ [DEFAULT].
- Documenti di architettura per-contesto: per i contesti rilevati al Passo 1, vuoi che ne crei/aggiorni
  uno per ciascuno (dal template)? Per i contesti dove un doc esiste già, lo lascio e mi limito a
  registrarlo. CHIEDI se procedere contesto per contesto o tutti insieme.
- TEST-PLAYBOOK (sempre chiesto): per ogni tipo di test che il progetto usa o vuole usare, raccogli
  COME si lancia (comando) e QUANDO si applica (quale tipo di cambiamento lo richiede). Esempi di tipi:
  non-regression/data-diff, end-to-end, unit, integration, validazione-spec. Se il progetto NON ha test,
  proponi di predisporre un runner (default sensato per lo stack rilevato) e cattura comunque le
  intenzioni di test. NON dedurre la strategia dal codice.
- CONVENZIONI/PREFERENZE di progetto (sempre chieste): naming, struttura, stile, regole UI, vincoli.
  Se esiste già un documento che le descrive, chiedi se usarlo come fonte; altrimenti raccoglile in
  intervista. Verranno salvate in flow.config e applicate dall'impl-runbook.
- MAX_REFINE: default avviso=3, blocco=6.
- Connettori: NON chiedere quale tool usare. I default sono già pronti — `productive` (ticketing) e
  `zammad` (helpdesk) — e l'interfaccia è agnostica/sostituibile via flow.config. L'unica cosa da
  sistemare sono le CREDENZIALI (variabili d'ambiente, vedi connectors/.env.example): segnala quali
  servono, non inventarle. Per cambiare connettore si usa la skill flow-settings, non l'install.
- Fast-path: chiedere ogni volta [DEFAULT] o auto sotto soglia? con quale soglia?
- Livello di essenzialità (Ponytail): default "lite".

## Passo 4 — Installazione
Se è disponibile Node ed esiste bin/install.mjs, eseguilo: fa le operazioni meccaniche
(crea flow.config.json e flow.lock.json, copia i riferimenti, scaffolding) in modo deterministico.
Se Node NON è disponibile, esegui TU le stesse operazioni a mano seguendo la lista in bin/install.mjs.
Operazioni:
- Crea flow.config.json dai default + le risposte dell'intervista del passo 3
  (incluso testPlaybook e projectConventions).
- Crea flow.lock.json con la versione del kit e l'hash dei file-chiave (per la cache assessment).
- Abilita il plugin SOLO in questo progetto: scrive enabledPlugins + extraKnownMarketplaces nel
  .claude/settings.json del progetto (mai globalmente). Skill e hook li fornisce il plugin: NON
  vengono copiati nel progetto. Se tokenEconomy.ponytail ≠ "off", abilita per-progetto ANCHE il
  plugin Ponytail (marketplace github DietrichGebert/ponytail) per l'essenzialità del codice.
  Se telemetry.enabled, scrive nel .claude/settings.json del progetto il blocco env che abilita
  l'OpenTelemetry nativo di Claude Code (SOLO in questo progetto) verso l'endpoint OTLP configurato
  (telemetry.otlpEndpoint). NON chiedere nulla sulla telemetria: è preconfigurata. Per disattivarla,
  telemetry.enabled=false.
- Crea AGENT.md (se assente) con le istruzioni del processo; fai sì che CLAUDE.md lo richiami
  (sezione delimitata da marcatori <!-- ai-dev-flow:start --> ... <!-- ai-dev-flow:end -->).
- Per ogni contesto per cui l'utente ha acconsentito: crea il documento di architettura dal
  template (lo riempi con quanto emerso dall'assessment + risposte; ciò che non sai, lo lasci
  come placeholder esplicito da completare — non inventare invarianti).
- Se mancano documentazione o file di struttura .md, creali dai template (chiedendo conferma).
- Inizializza il changelog: VUOTO con nota "storia pregressa non tracciata".
  Importa solo i tag/release git esistenti (dati strutturati), non ricostruire la storia.
- Se il progetto non ha test e l'utente ha acconsentito: setup del runner, poi cartella test.
INSTALLAZIONE TRANSAZIONALE: se un passo fallisce, annulla tutto (rollback). O tutto o niente.

## Passo 5 — Verifica (doctor)
- Controlla che ogni elemento del processo abbia un corrispettivo reale installato.
- Test funzionale dell'hook pre-edit-guard: prova a modificare un file di test fittizio; deve bloccare.
- Verifica che esista un documento di architettura per ogni contesto registrato in flow.config.
- Verifica che il test-playbook non sia vuoto (se lo è, avvisa: il test-selector non avrà regole).
- Verifica che i connettori richiesti siano raggiungibili.
- Riporta lo stato: cosa è a posto, cosa manca, cosa richiede una tua decisione successiva.
- Onesto sui limiti: non posso garantire che l'agente USI una skill, solo che è installata.

## Nota sull'idempotenza
Questa procedura può essere rieseguita senza danni: se qualcosa è già installato e coerente,
lo lascia com'è; aggiorna solo ciò che manca o è cambiato.
