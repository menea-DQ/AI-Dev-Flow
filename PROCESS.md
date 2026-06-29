# AI-Dev Flow — Processo
process-version: 0.0.1
compatibile-con: ">=0.0.1 <0.1.0"

## Principio fondante
L'AI esegue, la persona decide nei punti chiave (human-in-the-loop).
Tra i gate umani l'AI lavora in autonomia. Ai gate, si ferma e attende l'approvazione.

## Regola del 98% — comprensione prima dell'azione
Prima di QUALSIASI azione non banale (scrivere o modificare codice, comando distruttivo,
cambio di config, redazione di spec o piano) l'AI deve essere almeno al 98% sicura
di aver capito COSA le viene chiesto e PERCHÉ.
- Se è sotto il 98%: SI FERMA e fa domande mirate, finché non lo raggiunge.
- Non indovina, non "tappa" l'ambiguità con assunzioni, non parte "per vedere come va".
- Quando aiuta a far emergere un disallineamento, riformula all'utente la propria comprensione
  prima di procedere.
- "Non banale" è inteso in modo generoso: una correzione di refuso non richiede domande;
  tutto ciò che tocca dati, schema, pacchetti condivisi, logica di business o comportamento
  visibile all'utente sì.
Questa regola NON è opzionale e NON è situazionale: vale in ogni fase, per chiunque.
Una assunzione sbagliata su cui si agisce costa molto più di una domanda fatta in tempo.

## Artefatti di knowledge-store
Il processo si appoggia a un piccolo insieme di artefatti versionati (file .md), agnostici dal tool:
- Spec Store — le specifiche approvate.
- Changelog / Log decisioni — cosa è stato fatto e perché (append-only).
- Documenti di architettura PER-CONTESTO — uno per ogni contesto del progetto
  (in un monorepo: un documento per app/pacchetto/servizio; in un single-repo: uno solo).
  Descrivono SOLO il sistema com'è ORA: cosa fa quel contesto, come si incastrano i pezzi,
  dove si modifica in sicurezza, quali invarianti regge. Niente storia, niente "prima era così",
  niente "attualmente": il presente è già implicito. La storia vive in git.
- Test-playbook — la ricetta dei test del progetto (vedi Fase 3): è DICHIARATO, non inferito.

## Le 5 fasi

### Fase 0 — Intake
- Ingresso: una richiesta (CR/evolutiva o BUG) dal ticketing.
- L'AI normalizza la richiesta (skill: intake-parser): estrae tipo, priorità, riferimenti.
- Classifica CR vs BUG. Produce un "contesto richiesta" minimale.
- NON legge la codebase in questa fase (risparmio).
- Se il task sembra piccolo → valuta fast-path-eligibility (vedi sotto).

### Fase 1 — Definizione della specifica
- Retrieval mirato: l'AI legge solo i moduli rilevanti (skill: spec-context), non tutta la codebase.
- PRIMA di leggere il codice di un contesto, l'AI legge il documento di architettura di quel contesto.
  Se il documento è in drift rispetto al codice, lo segnala SUBITO all'utente (un doc stantio è
  peggio di nessun doc).
- Il validatore di specifica confronta la richiesta con codebase, constraint di progetto, changelog.
- Intervista sui buchi: l'AI fa domande SOLO dove la specifica è incompleta (vedi Regola del 98%).
  Le risposte vanno nel registro Q&A.
- Impact analysis: l'AI verifica sul changelog se la richiesta rompe scelte deliberate del passato.
- ► GATE UMANO 1: la persona approva la SPECIFICA.
- Loop di raffinamento: se la persona rifiuta, si torna all'intervista con i suoi commenti.
  Soglia di avviso e soglia di blocco definite in flow.config (MAX_REFINE).
- A spec approvata: salvataggio nello Spec Store + aggiornamento del task nel ticketing.

### Fase 2 — Implementazione
- L'AI carica la spec approvata e propone un PIANO (approccio, file toccati, rischi).
- ► GATE UMANO 2: la persona approva il PIANO.
- In parallelo e PRIMA dell'implementazione: il sub-agent test-author scrive i test
  ricevendo SOLO la spec (isolamento strutturale, vedi sezione Qualità).
- L'agente implementazione scrive il codice. Rispetta le convenzioni di progetto dichiarate
  in flow.config (NON le inferisce). NON può modificare i file di test (hook pre-edit-guard).
- Se la modifica tocca codice che produce/trasforma dati persistenti, scatta il gate
  pre-work-snapshot (vedi Qualità): si cattura lo stato "before" da codice ancora pristino.
- ► GATE UMANO 3: revisione rapida del diff.

### Fase 3 — Qualità (test secondo il PLAYBOOK del progetto)
- L'AI classifica il diff (cosa è cambiato: dati? frontend? API? logica?).
- Il test-selector sceglie quali test lanciare consultando il TEST-PLAYBOOK del progetto
  (flow.config.testPlaybook): per ogni tipo di test, il playbook dichiara COME si lancia
  e QUANDO si applica. Il selettore NON inventa la strategia di test e NON la inferisce dal codice.
- Categorie generiche di default (sovrascrivibili dal playbook):
  dati/ETL → non-regression a confronto pre/post (data-diff su invarianti);
  frontend → end-to-end; API/logica → unit + integration; trasversale → combinazione;
  validazione-spec → sempre (è leggera).
- Su monorepo: il test-selector interroga il tool nativo (Turborepo/Nx --affected);
  se assente, fallback conservativo (lancia tutto l'ambito coinvolto) + avviso.
- Se i test passano → Fase 4. Se falliscono → torna all'implementazione (fix).

### Fase 4 — Chiusura
- Aggiornamento documentazione: changelog (la scelta fatta e il perché) E, se la modifica ha
  cambiato la struttura/le invarianti di un contesto, il documento di architettura di quel contesto.
- Aggiornamento stato del task nel ticketing (Done / Review).

## Ramo BUG (variante della Fase 1-2)
- Riproduzione del bug (l'AI isola il caso minimo, usa il changelog per l'origine).
- Test che FALLISCE (red) che cattura il bug.
- Dopo la fix: lo stesso test passa (green). Il red-test entra stabilmente nella suite di non-regression.

## Fast-path (task piccoli)
- L'intake valuta se il task è fast-path-eligible (es. modifica circoscritta, basso rischio).
- Se sì, il sistema SI FERMA e chiede alla persona, spiegando cosa significa
  (skip impact-analysis e skip sub-agent test separato) e i rischi.
- La scelta può essere memorizzata in flow.config (auto sotto una soglia).
- La persona può sempre forzare il percorso completo su un singolo task.

## I tre gate umani (riepilogo)
1. Specifica  2. Piano  3. Revisione rapida del diff.
La persona resta il decisore. Nessun gate è saltato senza una scelta esplicita.

## Garanzia di qualità (anti teaching-to-the-test)
I test sono scritti da un sub-agent isolato che riceve solo la spec, PRIMA del codice,
e committati prima dell'implementazione. L'hook pre-edit-guard li rende read-only
per l'agente implementatore. L'isolamento è verificabile (git timestamp + hook).

## Snapshot "before" per le modifiche ai dati
Per le modifiche che toccano codice produttore di dati, la prova di non-regressione richiede
un confronto pre/post sugli stessi dati. Lo stato "before" va catturato MENTRE il codice è
ancora pristino: per questo il gate pre-work-snapshot scatta alla PRIMA modifica di quel tipo
nella sessione e chiede all'utente se catturare ora lo snapshot o rimandarlo (scelta umana).
