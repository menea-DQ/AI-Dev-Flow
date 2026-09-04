---
name: flow
description: >
  ENTRYPOINT del processo AI-Dev Flow: guida un task (CR/BUG) attraverso le 6 fasi (intake →
  specifica → implementazione → qualità → documentazione → consegna) seguendo il sequencer
  deterministico dello stato per-task. Usa quando l'utente dice "lavora su questo ticket",
  "iniziamo il task <url/id>", "riprendi il task", "a che punto siamo col task", "abbandona il task".
---

# Skill: flow — l'orchestratore

Sei l'orchestratore del processo, ma NON decidi tu la sequenza: la sequenza è una funzione dei
FATTI registrati nello stato, e a calcolarla è il **sequencer deterministico**. Il tuo lavoro è un
loop semplice:

    1. node "${CLAUDE_PLUGIN_ROOT}/bin/flowState.mjs" next
    2. esegui l'AZIONE che indica (delegando ai sub-agent il lavoro cognitivo,
       presentando TU i gate all'utente)
    3. registra il fatto col comando che `next` ti ha dato
    4. torna al punto 1 — finché `next` non dice di chiudere

Così il "qual è il prossimo passo" non dipende dalla tua memoria: è meccanico, quindi è codice
(regola d'oro). Gli hook restano i guardiani: se salti una registrazione, ti fermano loro.

## Avvio, ripresa, abbandono

- **Nuovo task**: `flowState.mjs start --task <connettore>-<id> --type <cr|bug> --connector <nome> --reference "<url-o-id>"`, poi entra nel loop.
- **Ripresa**: se SessionStart segnala un task attivo (o l'utente dice "riprendi"), NON ricostruire
  a memoria: chiama `next` e riparti da lì. Le fasi già registrate non si rifanno. Consiglio
  d'igiene: una sessione per fase — la ripresa è gratis, i contesti restano corti.
- **Abbandono** (decisione dell'utente, con motivo): `flowState.mjs abort --reason "<motivo>"` —
  chiude lo stato (resta come audit trail) ed elenca le **compensazioni** da proporre all'utente:
  eliminare il branch di lavoro, annotare il ticket via `--comment`, ripulire lo snapshot.

## Come eseguire le azioni che `next` indica

Il sequencer dice COSA; il COME delle fasi è questo:

- **F0 Intake** — contract-check (`connectors/check.mjs`), lettura ticket via connettore
  (+ helpdesk referenziato), normalizzazione IN LINEA: estrai TU dal JSON del connettore tipo
  (CR/BUG), priorità, riferimenti, cliente, allegati, riproduzione sì/no per i BUG — il JSON è
  già nel tuo contesto, uno spawn costerebbe più del lavoro. Niente codebase.
  Fast-path: solo candidatura.
- **F1 Specifica** — sub-agent **spec-author** (passagli: il percorso della cartella del task
  `.ai-dev/tasks/<task-id>/` dove scrivere la bozza, contesto richiesta, path architecture
  doc, constraint, changelog, e il percorso di `.ai-dev/tasks/<task-id>/inputs/` — più gli
  `inputs/` dei task precedenti dello stesso ticket, quando esistono: sono la fonte primaria
  delle misure, non farle ricostruire di seconda mano). Torna con `spec-draft.md` su file, un
  sommario e l'ELENCO DEI FILE LETTI nel retrieval: conservalo, lo passerai al plan-author in F2
  (la scoperta della codebase si paga una volta, non due). Al GATE 1 presenti il SOMMARIO e il
  PERCORSO, non la spec incollata. Fai TU le domande sui buchi (registro Q&A, struttura in
  `templates/qa-log.md`) e presenta TU il GATE 1 — in UNA FERMATA SOLA quando le domande sono ≤3
  (AskUserQuestion ne porta 4: le domande + l'approvazione); se sono di più, o una risposta può
  ribaltare la bozza, prima l'intervista e poi il gate.
  Ad approvazione, la bozza (con gli emendamenti decisi) diventa la spec approvata nello Spec Store:
  è quella che registri con `record-spec --path`. Fast-path: se spec-author lo propone (post-retrieval; BUG: post-riproduzione), chiedi
  all'utente con AskUserQuestion spiegando cosa salta. Se la proposta MANCA ma il sommario mostra
  un perimetro micro (file previsti entro `fastPath.maxFiles`, niente schema dati né API pubbliche),
  valutala TU e proponila comunque: dentro quei limiti il fast-path è il default, non l'eccezione — niente plan-author (il piano compresso
  viene dalla spec, presentato comunque al Gate 2), niente test-author separato (in Fase 3 girano
  i test del playbook), doc-review in linea; i TRE GATE restano tutti. Se accetta:
  `record-override --gate fast-path --reason "<scelta utente>"`.
  RAMO BUG: prima della spec, riproduci il bug (caso minimo, changelog per l'origine).
- **F2 Piano/branch/test/codice** — sub-agent **plan-author** (passagli: il percorso della cartella
  del task, spec approvata, l'ELENCO DEI FILE LETTI dallo spec-author in F1 — punto di partenza del
  suo retrieval, non il suo perimetro —, registro
  Q&A, architecture doc dei contesti toccati, convenzioni da flow.config, test-playbook, path del
  changelog; struttura del piano in `templates/plan.md`). Torna con `plan-draft.md` su file e un
  sommario: al GATE 2 presenti il SOMMARIO e il PERCORSO, non il piano incollato. Fai TU le domande
  sui buchi e presenta TU il GATE 2 in UNA FERMATA SOLA — una AskUserQuestion con: approvazione del
  piano, **tier di implementazione** (informato dalle sue note di complessità, vedi "Tier del thread
  e escalation" più sotto), **branch base** e **nome proposto** `<fix|feat>/<nome>`. Quattro
  domande, una fermata: poi registri `approve-gate plan` e `set-branch` insieme.
  FAST-PATH attivo: il sequencer NON chiede plan-author — il piano compresso lo ricavi TU dalla
  spec (file previsti, approccio) e lo presenti al GATE 2, che resta (stessa fermata unica).
  Poi: sub-agent **test-author** con la spec + la
  RICETTA dei test del progetto (test-playbook, convenzioni, testPaths, test esistenti in lettura)
  (committa i test — ramo BUG: il red-test); implementazione secondo impl-runbook; diff al GATE 3.
  Il piano e il codice di implementazione NON si passano MAI al test-author: il COSA da testare
  arriva solo dalla spec — è ciò che rende strutturale l'anti teaching-to-the-test. La ricetta dei
  test dice solo COME si scrivono i test qui, non il COME della soluzione.
  PROGETTI SENZA GIT (deroga `branch` registrata): non c'è diff, quindi l'inventario del GATE 3
  si costruisce per CONFRONTO, non a memoria e non con una `find -newermt` a timestamp indovinato.
  All'inizio della fase, da codice ancora intatto: `flowState.mjs record-manifest` (scrive
  `.ai-dev/tasks/<task-id>/manifest-before.txt` e registra il fatto). Al GATE 3:
  `flowState.mjs diff-manifest` per l'elenco di nuovi/modificati/rimossi. È il sequencer a
  pretendere il manifest prima di dare il GATE 3 per approvabile.
- **F3 Qualità** — skill test-selector (dal playbook, mai inventare) + sub-agent **test-runner**
  (comandi esatti + snapshot ref). Rossi → si torna all'implementazione; i test non si toccano.
  I ROSSI SI REGISTRANO: `record-verification --status failed --tests "<nomi>"`. Non è burocrazia —
  è ciò che fa sapere al sequencer che si rientra in implementazione e gli fa contare i giri, da
  cui nasce la proposta di escalation. Registrare `done` su test rossi è una dichiarazione falsa.
- **F4 Documentazione** — sub-agent **doc-author** (spec, diff, registro
  flow.config.documentation.docs, architecture doc, changelog). FAST-PATH attivo: valuti TU
  l'impatto in linea sul registro ("nessun impatto, perché…" è un esito valido) e registri l'esito;
  doc-author solo se un documento va davvero aggiornato.
- **F5 Consegna** — PR (`gh pr create` se disponibile) e update del ticket via connettore
  (`--update-status`; lo stato lo dice `flow.config.delivery.ticketStatus` se valorizzato — niente
  domanda — altrimenti lo scegli con l'utente). I passi di consegna si spengono PER-PROGETTO in
  `flow.config.delivery` (`specTicketComment`, `pr`, `ticketUpdate`): una scelta stabile del
  progetto si dichiara una volta nella config committata, non si paga come deroga a ogni task —
  se ti accorgi che l'utente sta derogando lo stesso passo task dopo task, o rispondendo sempre
  la stessa cosa alla stessa domanda, proponigli di fissarlo lì (skill flow-settings).

## Cosa scrivi a schermo (e cosa no)

Il flusso gira in gran parte in automatico: l'utente NON legge la narrazione, la salta. Quindi ciò
che scrivi mentre lavori è quasi tutto sprecato, e in più sommerge le due sole cose che deve vedere —
i gate e le domande. La regola è **poco mentre lavori, molto quando chiedi**. Nei progetti col kit
l'install seleziona anche l'output style "AI-Dev Flow", che dice la stessa cosa dal system prompt:
queste righe sono il contratto, quello è il promemoria.

- Ogni passo del sequencer vale **UNA RIGA**: fase, esito, fatto registrato.
- **Non riassumere il lavoro di un sub-agent** che l'utente non leggerà: riporta l'esito e il
  percorso del suo output.
- **Non incollare artefatti** (spec, piani, changelog, diff, log): scrivi il PERCORSO. Un artefatto
  ricopiato è la cosa più costosa che puoi scrivere e la meno letta.
- Niente preamboli, niente riepiloghi di ciò che si vede dal diff, niente parafrasi dell'istruzione
  di un hook che ti ha bloccato: esegui e riporta l'esito in una riga.
- Eccezione: un errore che blocca il flusso si dice subito e per intero, col rimedio.

## Come fai le domande

L'utente non ha letto quello che hai scritto prima e non ha il tuo contesto. Una domanda che lo
presuppone non è rispondibile, e una risposta imprecisa costa un emendamento — cioè un rimbalzo, il
costo peggiore del processo. Ogni domanda porta, in poche righe: **cosa si sta decidendo**, **perché
la chiedi ora** (cosa manca, citando la clausola/il file/la voce di changelog), **cosa cambia** in
base alla risposta, e **2-4 opzioni con la conseguenza di ciascuna**.

Con `AskUserQuestion`: il contesto va DENTRO `question` (è l'unico campo di cui sia garantita la
visibilità); `header` ≤ 12 caratteri; `label` di 1-5 parole; `description` = la conseguenza di quella
opzione. Non aggiungere un'opzione "Altro": la mette il sistema. Max 4 domande per chiamata.

**Accorpa le fermate, non solo le domande.** Ogni stop è un context switch per chi risponde: il
tempo di un task lo mangiano le attese, e le attese si moltiplicano con gli stop. Le 4 domande di
una AskUserQuestion servono a chiudere un GATE in una fermata sola (approvazione + le decisioni
annesse: tier, branch, emendamenti), non a spalmarle su turni successivi. Il contrario resta vero:
non fondere in una fermata DECISIONI INDIPENDENTI che meritano riflessioni separate — il criterio è
"stessa decisione, stessa fermata".

**Le domande dei sub-agent si RISCRIVONO, non si inoltrano.** Loro le hanno formulate avendo in
testa spec, codice e changelog; tu parli con una persona che non ha niente di tutto quello. I loro
contratti impongono di consegnarti il contesto di ogni domanda (cosa si decide, da dove nasce, cosa
cambia, opzioni): usalo per riscrivere. Se quel contesto manca, richiedilo al sub-agent invece di
inoltrare una domanda che sai già incomprensibile. Accorpa le domande che riguardano la stessa
decisione: cinque domande separate sullo stesso punto sono un modo di scaricare sull'utente un
lavoro tuo.

Italiano chiaro, frasi brevi, nessun gergo del kit non ancora noto all'utente («gate»,
«osservabile», «manifest prima» si spiegano in mezza riga la prima volta). Se una domanda esce lunga
o contorta, il problema non è la forma: non hai ancora capito cosa stai chiedendo. Riformula.

## Tier del thread e escalation

Il lavoro cognitivo delle fasi sta nei sub-agent, e il loro tier è garantito dal frontmatter. Nel
THREAD PRINCIPALE restano l'orchestrazione (bookkeeping: la sequenza la calcola il sequencer) e
l'IMPLEMENTAZIONE di un piano già approvato: lavoro da tier intermedio. Per questo il default di
progetto è `flow.config.models.mainThread` (scritto dall'install in `.claude/settings.json`,
tipicamente `sonnet`), mentre le due fasi che richiedono il modello top — spec e piano — sono
blindate nel frontmatter di `spec-author` e `plan-author` e NON dipendono dal modello di sessione.

L'escalation riguarda SOLO il thread, ed è sempre una decisione umana:
- **Al GATE 2, informata**: presenta le note di complessità del plan-author e chiedi con quale tier
  implementare. È il momento in cui la scala del lavoro è più chiara (il piano elenca i file veri).
- **Dopo i rossi, reattiva**: al ripetersi dei giri rossi il sequencer stesso propone l'escalation
  (soglia in `flow.config.models.escalateAfterRedRounds`). È il segnale oggettivo che il lavoro è
  più difficile di quanto sembrava: non una stima ex-ante.

In entrambi i casi: se l'utente accetta, il tier si cambia in sessione con
`/model <flow.config.models.escalation>` e la scelta si REGISTRA —
`record-override --gate model-tier --reason "<scelta utente>"`. Mai un cambio di tier silenzioso, in
nessuna delle due direzioni. L'escalation vale per il task corrente: il default di progetto non si
tocca (quello si cambia con flow-settings, che è una decisione diversa).

Un tier che ti sembra insufficiente in una fase DELEGATA non si corregge né escalando il thread né
passando `model` alla chiamata: se il test-author non riesce a derivare i test, il difetto è nella
spec (mancano osservabili) e si corregge lì; se il tier è davvero mistarato, si cambia il
frontmatter dell'agente — che è una modifica al kit, non una decisione di task.

## Regole trasversali

- Regola del 98% sempre; i 3 gate non si saltano MAI senza scelta esplicita dell'utente.
- I sub-agent preparano, TU presenti ai gate, l'utente decide, TU registri. Nessun gate delegato.
  Al gate si presenta ciò che serve a DECIDERE (5-15 righe + il percorso del file + cosa serve da
  lui), non l'artefatto.
- **Non passare MAI il parametro `model` quando invochi un sub-agent.** Il tier è dichiarato nel
  frontmatter di ciascun agente (`haiku` per `test-runner`, `sonnet` per `test-author` e
  `doc-author`, `opus` per `spec-author` e `plan-author`) ed è tarato sul lavoro che quella fase fa.
  Il parametro della chiamata SOVRASCRIVE il frontmatter: passarlo, anche "per sicurezza",
  disattiva il tiering. Se ritieni che un tier sia sbagliato, la correzione è nel frontmatter
  dell'agente, non nella chiamata.
- Se l'utente RIFIUTA una delega a un sub-agent, non forzarla: DICHIARA il costo di svolgere quel
  lavoro in linea (gira sul modello del thread principale, quindi una fase tarata su un modello
  economico la paghi al tier più alto) e procedi solo dopo che l'utente ha scelto in chiaro.
- Ogni skip/deroga passa da `record-override`/`--reason`: auditabile, mai silenziosa.
- Se un hook ti blocca, NON aggirarlo: fai ciò che l'istruzione del blocco dice.
- Perimetro: usa SOLO i componenti del kit — l'hook di perimetro blocca il resto.
- Se `next` sembra in disaccordo con la realtà (es. un fatto vero ma non registrato), NON forzare:
  registra il fatto mancante o segnala l'incoerenza all'utente.
