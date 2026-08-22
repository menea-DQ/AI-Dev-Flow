# Proposta di modifica ad AI-Dev Flow — ridurre token e tempo senza toccare i presidi

**Per chi legge:** sei l'agente incaricato di modificare questa skill. Questo documento è
autosufficiente: contiene le misure, la diagnosi e le modifiche puntuali con i criteri di
accettazione. Non ti serve la conversazione da cui nasce.

**Data:** 2026-08-22 · **Origine:** consuntivo del task `productive-19365696-inc4` (INC-4, l'ultimo
incremento del progetto `kanban_progress`), portato a termine con il flusso completo a sei fasi.

---

## 0. Dove vivono i file da modificare

```
/Users/dq-user/.claude/plugins/cache/ai-dev-flow/ai-dev-flow/0.1.0/
├── skills/flow/SKILL.md          ← l'orchestratore
├── agents/spec-author.md         ← Fase 1
├── agents/test-author.md         ← Fase 2
├── agents/doc-author.md          ← Fase 4
├── agents/intake.md              ← Fase 0
├── agents/test-runner.md         ← Fase 3
├── templates/{changelog,spec,plan,qa-log}.md
└── bin/flowState.mjs             ← registro dei fatti per-task
```

**Il percorso `cache/` non è una cache da cui diffidare.** In
`~/.claude/plugins/known_marketplaces.json` il marketplace `ai-dev-flow` è dichiarato
`"source": {"source": "directory", "path": "…/cache/ai-dev-flow/ai-dev-flow/0.1.0"}`, cioè punta a
quella stessa cartella: **è il sorgente**, non una copia scaricata. Nessun aggiornamento remoto la
sovrascrive, e le modifiche fatte lì sono durevoli. Non cercare un repo upstream: non c'è.

---

## 1. Le misure del task, così puoi verificare di aver migliorato

Consuntivo dei soli sub-agent (il contesto dell'orchestratore non è misurabile dall'interno, quindi
i totali reali sono **superiori** a questi).

| Fase | Sub-agent | Token | Tempo | Chiamate a tool | Passaggi |
|---|---|---|---|---|---|
| 1 | `spec-author` | 505 727 | 26 min | 67 | 2 |
| 2 | `test-author` | 848 457 | 87 min | 159 | 2 |
| 3 | `test-runner` | 33 615 | 2 min | 4 | 1 |
| 4 | `doc-author` | 547 555 | 24 min | 157 | 2 |
| | **totale** | **≈ 1 935 000** | **2 h 19** | **387** | |

Ripartizione per causa, ed è il dato che orienta tutto il resto:

- **secondi passaggi: 972 000 token, cioè il 50%** del totale (266k spec-author + 430k test-author
  + 276k doc-author);
- primi passaggi: 963 000 token.

Peso dei documenti che ogni fase rilegge, nel progetto in cui il task è stato svolto:

| Documento | Byte |
|---|---|
| `.ai-dev/specs/*.md` (6 spec, una per incremento) | 542 000 |
| `.ai-dev/changelog.md` | 117 000 |
| `architecture.md` | 81 000 |
| **totale rileggibile** | **≈ 740 000** |

Quattro sub-agent con contesti isolati leggono sottoinsiemi sovrapposti di quei 740 KB: **la lettura
si paga quattro volte e non si condivide**. E cresce a ogni incremento: la spec del solo INC-4 è
88 KB, più grande di `architecture.md`.

---

## 2. Diagnosi

### Causa A — i rimbalzi, e due dei tre erano colpa della skill

**A1. Lo spec-author non sapeva di dover leggere gli input di Fase 0.** Costo: ≈266 000 token.

`skills/flow/SKILL.md`, riga della Fase 1, dice oggi:

> `- **F1 Specifica** — sub-agent **spec-author** (passagli: contesto richiesta, path architecture doc, constraint, changelog).`

e `agents/spec-author.md` elenca quattro input: contesto richiesta, documenti di architettura,
constraint, changelog. **Nessuno dei due nomina `.ai-dev/tasks/<task-id>/inputs/`**, dove la Fase 0
del primo task del progetto ha depositato la discovery in sola lettura sul sistema sorgente (brief
degli stakeholder, misure di copertura dei campi, fixture grezze dell'API).

Conseguenza osservata: lo spec-author ha dichiarato «non verificabili» due misure che erano
documentate in `inputs/discovery-productive.md`, e ha costruito su quell'assenza una domanda di gate
falsa («va confermato dall'utente»). L'orchestratore l'ha dovuto rimandare indietro con la fonte. Al
secondo passaggio, quelle stesse misure hanno **cambiato la sostanza** di una raccomandazione — la
copertura reale del dato era il 6% e non il 21% che quattro documenti si passavano di mano.

**A2. La spec è arrivata al gate con cinque clausole non osservabili.** Costo: ≈430 000 token — la
singola chiamata più cara di tutto il task.

Il test-author (che lavora **alla cieca sulla sola spec**, per progetto) ha trovato cinque punti su
cui non poteva scrivere un test senza inventare struttura, e li ha correttamente segnalati invece di
colmarli. Sono diventati cinque emendamenti post-gate, e hanno richiesto un suo secondo passaggio
completo.

Uno dei cinque era una **contraddizione interna**: la tabella del modello dati elencava otto colonne
e nessuna via di ritiro, mentre una decisione presa al gate faceva del ritiro «una colonna» il cui
nome non era dichiarato da nessuna parte. Gli altri quattro erano clausole che descrivevano un
comportamento senza dire **come si osserva** (cosa succede a una data di validità futura; se un
conteggio conta le card o i task; se una superficie tace o dichiara; quanti valori ammette un
vocabolario).

Nessun passo della skill chiede allo spec-author di verificare che ogni clausola sia osservabile.

**A3. Il terzo rimbalzo si è pagato da sé, e non va ottimizzato via.** Il doc-author di Fase 4,
confrontando un emendamento con il codice che doveva realizzarlo, ha trovato **un difetto di
comportamento** — non un drift di prosa: un ramo dell'interfaccia che usciva con `return null` dove
la specifica chiedeva una dichiarazione esplicita. Nessun test lo copriva e nessuno lo avrebbe
coperto. Vedi §4: questo è da preservare.

### Causa B — il changelog e le spec crescono senza tetto e vengono riletti per intero

Il template attuale (`templates/changelog.md`) è di tre righe per voce:

```
## [data] — [ticket] — [titolo]
- Cosa: [sintesi della modifica]
- Perché: [motivazione, scelta deliberata]
- Impatti: [aree toccate, eventuali scelte che questa modifica vincola]
```

Nella pratica, con l'istruzione «registra COSA e PERCHÉ» e — nei progetti senza git — «il changelog è
l'unica traccia storica», ogni voce è diventata un saggio: la voce di un singolo incremento arriva a
80-100 righe di prosa densa, e il file a 117 KB dopo sette task. **Ogni impact analysis futura lo
rilegge tutto**, perché niente distingue la parte normativa (cosa è diventato vincolante) dalla
narrativa (perché, con gli argomenti scartati).

Lo stesso vale per le spec: il template è di nove sezioni brevi, ma la spec prodotta è di 88 KB,
perché mescola il contratto (perimetro, modello dati, criteri, decisioni) con il ragionamento che lo
giustifica. Le fasi a valle hanno bisogno del primo e leggono entrambi.

### Causa C — il tiering dei modelli esiste, ma l'orchestratore lo può disattivare e lo ha fatto

I frontmatter sono corretti e ben tarati:

| Agente | `model` dichiarato |
|---|---|
| `intake` | `haiku` |
| `test-runner` | `haiku` |
| `doc-author` | `sonnet` |
| `spec-author` | `opus` |
| `test-author` | `opus` |

Ma il parametro `model` della chiamata al tool Agent **prende precedenza sul frontmatter**.
Nell'esecuzione misurata l'orchestratore ha passato `model: 'opus'` a tre sub-agent «per sicurezza»,
e su `doc-author` questo ha significato **547 000 token su Opus per un lavoro progettato per
Sonnet**. Su `spec-author` e `test-author` il valore coincideva col frontmatter, quindi era solo
ridondante — ma la stessa abitudine, applicata a `intake` o `test-runner`, moltiplicherebbe per un
ordine di grandezza il costo di due fasi meccaniche.

La skill non dice da nessuna parte «non passare `model`».

### Causa D — nei progetti senza git, il GATE 3 costa un supplemento evitabile

Con la deroga `branch` attiva (progetto senza repository), il GATE 3 non ha un diff: la skill chiede
una revisione «sui file prodotti» e suggerisce che il piano elenchi i file previsti. Nell'esecuzione
misurata l'orchestratore ha ricostruito l'inventario con `find -newermt`, **sbagliando due volte il
timestamp di taglio** e includendo file appartenenti alla coda dell'incremento precedente. Ogni
tentativo è una chiamata a tool e una verifica manuale.

---

## 3. Le modifiche da fare, in ordine di resa

### C1 — Aggiungere gli input di Fase 0 al contratto d'ingresso della Fase 1

**File:** `skills/flow/SKILL.md`, `agents/spec-author.md`

In `SKILL.md`, alla riga della Fase 1, aggiungi agli input passati allo spec-author:
`percorso di .ai-dev/tasks/<task-id>/inputs/` **e** degli `inputs/` dei task precedenti dello stesso
ticket, quando esistono.

In `agents/spec-author.md`, aggiungi un quinto punto all'elenco «Input che ricevi» con questo
contenuto sostanziale:

> - gli **input di Fase 0** (`.ai-dev/tasks/<task-id>/inputs/` e quelli dei task precedenti dello
>   stesso ticket): brief degli stakeholder, discovery in sola lettura sul sistema sorgente, fixture
>   grezze. **Sono la fonte primaria delle misure**: quando una cifra circola nei changelog di seconda
>   mano, l'originale è qui. Prima di dichiarare una misura «non verificabile», aprili.

E nel punto 2 (impact analysis) aggiungi: se una misura citata dal changelog è rilevante per una
decisione, risalire all'originale in `inputs/` invece di propagare la citazione.

**Accettazione:** uno spec-author invocato su un task il cui progetto ha misure in `inputs/` non
deve produrre né «non verificabile» né una domanda di gate su un dato già documentato lì.

---

### C2 — Auto-controllo di osservabilità nello spec-author, prima del gate

**File:** `agents/spec-author.md`, `templates/spec.md`

In `agents/spec-author.md`, inserisci un passo nuovo **dopo** la redazione della bozza e **prima**
dell'elenco delle domande (quindi fra gli attuali 3 e 4), sostanzialmente:

> 4. **Controllo di osservabilità, obbligatorio prima di consegnare.** Rileggi il comportamento
>    atteso clausola per clausola. Per ognuna, dichiara **come si osserva**: quale tipo di test del
>    playbook la coprirebbe e su cosa asserisce. Una clausola che non ha un osservabile **non è una
>    clausola: è una domanda di gate** — spostala fra le domande. Verifica in particolare i casi che
>    la prosa dà per ovvi: il valore assente, quello futuro, quello a zero, l'unità di misura, e
>    l'unità di conteggio (card o record? riga o aggregato?).
>    Ricorda perché serve: il test-author di Fase 2 lavora **alla cieca sulla sola spec**. Ciò che
>    non è osservabile per te non lo è per lui, e diventa un emendamento dopo il gate — cioè un suo
>    secondo passaggio completo.

E nel punto successivo (contraddizioni): aggiungi il controllo di **coerenza interna fra le decisioni
di gate e le sezioni scritte prima di esse** — nel caso misurato, una decisione presa al gate rendeva
incompleta una tabella del modello dati redatta prima, e nessuno se n'è accorto fino alla Fase 2.

In `templates/spec.md`, nella sezione «Comportamento atteso», aggiungi l'istruzione che ogni clausola
porti accanto il proprio osservabile.

**Accettazione:** nella spec consegnata al GATE 1, ogni clausola del comportamento atteso ha un
osservabile dichiarato, oppure compare fra le domande di gate. Gli emendamenti post-gate tendono a
zero.

---

### C3 — Vietare all'orchestratore di sovrascrivere il modello

**File:** `skills/flow/SKILL.md`, sezione «Regole trasversali»

Aggiungi una regola, sostanzialmente:

> - **Non passare mai il parametro `model` quando invochi un sub-agent.** Il tier è dichiarato nel
>   frontmatter di ciascun agente (`haiku` per `intake` e `test-runner`, `sonnet` per `doc-author`,
>   `opus` per `spec-author` e `test-author`) ed è tarato sul lavoro che quella fase fa. Il parametro
>   della chiamata **sovrascrive** il frontmatter: passarlo, anche «per sicurezza», disattiva il
>   tiering. Se ritieni che un tier sia sbagliato, la correzione è nel frontmatter dell'agente, non
>   nella chiamata.

**Accettazione:** nessuna istruzione o esempio della skill passa `model`. Su un task equivalente,
`doc-author` gira su Sonnet.

---

### C4 — Testa normativa breve nel changelog, narrativa sotto una barriera di lettura

**File:** `templates/changelog.md`, `agents/doc-author.md`, `agents/spec-author.md`

È l'intervento che taglia il costo che **cresce da solo** a ogni incremento.

Porta il template a questa forma:

```markdown
## [data] — [ticket] — [titolo]

### Vincolante — max 15 righe. È l'unica parte che le fasi successive leggono.
- Diventa vincolante: [invarianti, contratti, vocabolari che i task futuri non possono ignorare]
- Congelato / sorvegliato: [aree che non si toccano, e con quale presidio]
- Debiti: [aperti · chiusi · peggiorati, con la sigla]
- Superfici nuove: [rotte, comandi, tabelle]
- Misure: [cifre che decisioni future useranno, con il percorso della FONTE primaria]

<!-- ————— NARRATIVA — non la leggono le fasi successive, se non per tracciare UNA decisione nominata ————— -->
- Cosa: [sintesi della modifica]
- Perché: [motivazione, alternative scartate, scoperte]
- Impatti: [aree toccate, scelte che questa modifica vincola]
```

In `agents/doc-author.md`: la testa **Vincolante** ha un tetto duro di 15 righe; ciò che non ci sta
va nella narrativa. La testa non contiene argomenti né alternative: solo ciò che vincola.

In `agents/spec-author.md`, punto 2: leggere **le sole teste `Vincolante`** di tutte le voci, e
scendere nella narrativa **solo** per tracciare una decisione nominata (una sigla, un criterio).
Aggiungi la ragione, così non viene «ottimizzata» via: la narrativa è la memoria del progetto e va
scritta, ma rileggerla per intero a ogni task è ciò che rende il costo crescente nel numero di task
già svolti.

**Accettazione:** l'input che un `spec-author` prende dal changelog scende da ~117 KB a pochi KB, e
resta costante al crescere del numero di voci.

---

### C5 — Stessa separazione nella spec

**File:** `templates/spec.md`, `agents/test-author.md`, `agents/doc-author.md`

Dividi la spec in due parti dichiarate:

- **Parte normativa** — perimetro (dentro/fuori), modello dati, comportamento atteso con i suoi
  osservabili, criteri di accettazione, decisioni di gate, elenco dei file previsti. **Deve essere
  autosufficiente**: il test-author deve poter derivare i test leggendo solo questa.
- **Parte di motivazione** — impact analysis, alternative scartate, rischi, scoperte.

In `agents/test-author.md` e `agents/doc-author.md`: leggere la parte normativa per intero; la
motivazione solo quando serve a decidere fra due letture della parte normativa.

**Accettazione:** il test-author produce la suite completa leggendo la sola parte normativa. Se non
ci riesce, la parte normativa è incompleta — ed è un difetto da correggere lì, che è esattamente il
segnale che C2 vuole far emergere prima del gate.

---

### C6 — Progetti senza git: manifest all'avvio, non `find` a posteriori

**File:** `skills/flow/SKILL.md` (Fase 2, passo del branch) e, se scegli la via robusta,
`bin/flowState.mjs`

Quando la deroga `branch` è attiva, l'orchestratore scrive all'avvio della Fase 2 un manifest dello
stato «prima» — elenco dei file sotto le directory di lavoro con la loro impronta — in
`.ai-dev/tasks/<task-id>/manifest-before.txt`. Al GATE 3 l'inventario si ottiene confrontando il
manifest con lo stato corrente.

Via robusta: aggiungi a `flowState.mjs` un comando `record-manifest` che lo produce e lo registra fra
i fatti del task, così il sequencer può pretenderlo prima di dare per approvabile il GATE 3.

**Accettazione:** al GATE 3 l'elenco dei file nuovi/toccati è prodotto da un confronto e non da una
`find` con un timestamp indovinato; l'inventario non contiene file di task precedenti.

---

## 4. Cosa NON toccare, e perché

Il costo misurato non è tutto sprecato, e questi presidi sono la ragione. Nel task misurato hanno
prodotto, tutti e tre, difetti che nessuna configurazione più economica avrebbe trovato:

1. **L'isolamento del test-author** (riceve la sola spec, scrive prima del codice, e l'implementatore
   non può modificare i test). Ha fatto emergere che una fixture end-to-end seminava **una sola**
   riga di dato, il cui valore individuale **coincideva con l'aggregato** che la nuova funzione
   doveva mostrare: un presidio di sicurezza che sarebbe rimasto verde per coincidenza aritmetica —
   il modo peggiore in cui un presidio sopravvive. Ha anche trovato che un helper di reset del
   database non conosceva una tabella nuova e **impediva la pulizia** fra i run, facendo poi fallire
   file che non c'entravano.
2. **I tre gate umani.** Il GATE 1 ha deciso dodici questioni di cui quattro cambiavano un'invariante
   di sicurezza o il risultato osservabile; una di esse ha evitato di aggirare un presidio con un
   rinominamento.
3. **La Fase 4 come revisione e non come trascrizione.** Ha trovato un difetto di comportamento che
   nessun test copriva (§2, A3), più due affermazioni false nel README che rendevano **rotto l'avvio
   in locale** di uno sviluppatore nuovo, latenti da due incrementi.

La regola che ne deriva: **taglia la rilettura e i rimbalzi, non la separazione dei ruoli.** Se una
proposta di ottimizzazione riduce il numero di sub-agent, unisce due fasi, o dà all'implementatore la
facoltà di correggere i test, è fuori da questo mandato.

Un'ultima avvertenza sulla Fase 0: nel task misurato la delega all'`intake` è stata rifiutata
dall'utente e l'orchestratore ha svolto quel lavoro in linea, cioè **sul modello del thread
principale** (Opus) per un compito tarato su Haiku. Se vuoi coprire anche questo caso, la strada non
è forzare la delega ma prevedere nella skill che, quando una delega viene rifiutata,
l'orchestratore **dichiari il costo** di farlo in linea prima di procedere.

---

## 5. Stima

C1–C4 sono gli interventi con resa immediata: **40–50%** su un task di questa forma, ottenuti
eliminando due rimbalzi su tre (≈700 000 token) e riportando la Fase 4 sul tier per cui è progettata
(≈547 000 token da Opus a Sonnet). C5 e C6 valgono meno in token e molto in tempo e in affidabilità
del GATE 3.

Nessuno dei sei interventi rimuove un presidio, cambia il numero delle fasi, o riduce il numero dei
gate umani.
