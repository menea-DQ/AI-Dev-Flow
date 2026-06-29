# AI-Dev Flow

### Un processo di sviluppo software AI-assistito, standardizzato e applicabile a tutti i progetti aziendali

> **Nota sul nome.** "AI-Dev Flow" è un nome di lavoro provvisorio. Può essere cambiato in qualsiasi momento senza impatto sul progetto.

---

## In una frase

AI-Dev Flow è un sistema che trasforma il modo in cui usiamo l'intelligenza artificiale per sviluppare software: prende il processo che oggi seguiamo in modo manuale e disomogeneo, lo rende uno **standard unico, automatizzato e ripetibile**, applicabile a ogni progetto dell'azienda, mantenendo sempre il **controllo umano** nei punti che contano e tenendo sotto controllo i **costi** dell'AI.

---

## Il problema che risolviamo

Oggi usiamo già l'AI per sviluppare, e funziona. Ma il modo in cui la usiamo ha tre debolezze:

**È artigianale e non uniforme.** Ogni sviluppatore, su ogni progetto, segue un processo leggermente diverso, in parte manuale. La qualità dipende da chi lo fa e da come lo fa quel giorno. Non è un metodo aziendale: è una somma di abitudini individuali.

**Non è ripetibile né trasferibile.** Quando funziona bene, quel "bene" resta nella testa della persona che l'ha fatto. Non è codificato, non si può insegnare facilmente a un nuovo collega, non si può applicare automaticamente a un nuovo progetto.

**I costi dell'AI non sono governati.** L'AI ha un costo per ogni utilizzo. Senza un processo che ottimizzi *quanto* e *come* la usiamo, il rischio è spendere più del necessario, soprattutto crescendo il numero di progetti.

AI-Dev Flow risponde a tutti e tre: **standardizza** il processo, lo rende **ripetibile su ogni progetto con un comando**, e mette il **controllo dei costi** tra le sue priorità di progettazione.

---

## L'idea di fondo: l'uomo decide, l'AI esegue

Il principio che tiene insieme tutto il sistema è il cosiddetto **"human-in-the-loop"**: l'AI fa il lavoro pesante e ripetitivo, ma le **decisioni chiave restano alla persona**. Non è un sistema che "fa da solo" e ci si fida ciecamente; è un sistema dove l'AI prepara, propone e verifica, e l'essere umano approva nei tre momenti decisivi.

I tre punti di controllo umano (i "gate") sono:

1. **Approvazione della specifica** — prima che si scriva una riga di codice, la persona conferma che l'AI ha capito *cosa* va fatto.
2. **Approvazione del piano** — la persona conferma *come* l'AI intende realizzarlo, prima che inizi.
3. **Revisione rapida del codice** — uno sguardo finale prima della chiusura.

Tra questi gate, l'AI lavora in autonomia attraverso cinque fasi: ricezione della richiesta, definizione della specifica, implementazione, verifica della qualità, chiusura. Il diagramma di processo allegato illustra l'intero flusso nel dettaglio.

---

## Le caratteristiche che rendono il sistema solido

Queste sono le scelte di progettazione che distinguono AI-Dev Flow da un semplice "usiamo l'AI con più ordine". Sono il risultato di una progettazione attenta e di una validazione critica ripetuta.

**Funziona su progetti nuovi e su progetti già esistenti.** Il sistema si installa con un comando sia partendo da zero, sia su un progetto con anni di storia. Su un progetto esistente, prima di toccare qualsiasi cosa, **verifica cosa è già presente** (documentazione, test, struttura) e **adatta** sé stesso al progetto invece di imporsi, chiedendo o creando solo ciò che manca.

**Un solo standard, aggiornabile per tutti.** Il sistema vive in un punto centrale e ogni progetto vi si "aggancia". Quando miglioriamo il processo, lo aggiorniamo una volta sola, e ogni progetto può adottare la nuova versione quando il suo responsabile lo decide. Niente più dieci versioni diverse dello stesso metodo.

**Indipendente dallo strumento (per quanto possibile).** Il cuore del processo non è legato a un singolo strumento AI. Se in futuro cambiassimo lo strumento di sviluppo, riscriveremmo solo un piccolo "adattatore", non l'intero metodo. Questo protegge l'investimento nel tempo.

**Qualità del codice garantita in modo strutturale.** Una delle parti più delicate dello sviluppo AI-assistito è evitare che chi scrive il codice scriva anche test "compiacenti" che passano per forza. Il nostro sistema separa chi scrive i test da chi scrive il codice, in modo verificabile: i test nascono dalla specifica *prima* che il codice esista, e non possono essere modificati per farli passare artificialmente. È una garanzia di qualità incorporata nel processo, non lasciata alla buona volontà.

**Testa solo ciò che serve.** Il sistema capisce *cosa* è stato modificato e lancia solo i test pertinenti: se si tocca il database, parte la verifica anti-regressione; se si tocca l'interfaccia, partono i test dell'interfaccia. Non spreca tempo e risorse eseguendo test inutili. Questo è insieme una scelta di qualità e di **risparmio**.

---

## Il controllo dei costi: una priorità, non un ripensamento

Poiché ogni utilizzo dell'AI ha un costo, il sistema integra fin da subito alcune leve di ottimizzazione, scelte per dare il **miglior rapporto tra costo e risultato**:

**Riduzione del codice prodotto.** Integriamo uno strumento (open-source, sostituibile) che fa "ragionare l'AI come lo sviluppatore senior più essenziale": scrive solo il codice strettamente necessario, riutilizzando ciò che già esiste invece di reinventarlo. In test reali questo riduce il codice prodotto di circa la metà, mantenendo intatte sicurezza e qualità. Meno codice significa meno costo, meno bug, meno manutenzione.

**Riduzione del contesto elaborato.** Un secondo strumento (anch'esso opzionale e sostituibile) comprime le informazioni che vengono inviate all'AI, riducendo i costi di elaborazione anche del 60-90% senza perdere qualità nelle risposte.

**Percorso veloce per task semplici.** Per un intervento banale (es. correzione di una riga), il sistema riconosce che non serve l'intero processo completo e propone un "percorso veloce", spiegando i rischi e lasciando la scelta alla persona. Non si usa un martello per una puntina.

**Lavoro mirato, non esaustivo.** Il sistema legge solo le parti di progetto rilevanti per il compito, invece di rileggere tutto ogni volta. È la differenza più grande in termini di costo su progetti grandi.

---

## Il piano di realizzazione in tre fasi

Abbiamo scelto deliberatamente di **non costruire tutto insieme**, ma di rilasciare per fasi, così da avere qualcosa di reale e utilizzabile in tempi brevi e da affinare il sistema sul campo prima di estenderlo. Coerentemente con la filosofia di essenzialità del sistema stesso.

### Fase 1 — MVP (il cuore funzionante)

L'obiettivo è avere un sistema reale, installabile e usabile su un progetto vero. Comprende:

- Installazione su progetto **nuovo** e su progetto **esistente**, con verifica-prima-di-creare.
- I **tre gate umani** (specifica, piano, revisione).
- La **selezione intelligente dei test** in base a ciò che cambia.
- La **garanzia strutturale di qualità** (separazione test/implementazione).
- Il meccanismo di **aggancio e configurazione** per-progetto.

Al termine della Fase 1 abbiamo un sistema che rende reale il processo del diagramma e lo possiamo provare su un progetto pilota.

### Fase 2 — Robustezza e governo

L'obiettivo è rendere il sistema affidabile su molti progetti contemporaneamente. Comprende:

- **Telemetria dei costi** — la misurazione automatica di quanto costa ogni attività (token, tempo, tipo di percorso). Serve a sapere con numeri reali se stiamo risparmiando, e costituisce la base dati per le analisi future. Senza misurare, l'ottimizzazione sarebbe un'impressione, non un fatto.
- **Verifica dei connettori (contract-check)** — un controllo automatico che garantisce che le integrazioni con i sistemi esterni (es. il sistema di ticketing) continuino a funzionare come previsto, segnalando subito eventuali rotture dovute a cambiamenti esterni, prima che blocchino il lavoro.
- **Sistema di aggiornamento automatico (migrazione)** — il meccanismo che permette di aggiornare il sistema su tutti i progetti in modo indolore, trasformando automaticamente i dati dal vecchio al nuovo formato, senza interventi manuali ripetuti su ogni progetto.
- Attivazione opzionale della **compressione del contesto** per l'ulteriore risparmio sui costi.

### Fase 3 — Analisi e dashboard aziendale

L'obiettivo è trasformare i dati raccolti in conoscenza utile per l'azienda. Comprende:

- **Statistiche avanzate** sui costi e sull'efficienza del processo, per progetto e aggregate.
- Una **dashboard di analisi aziendale** agganciata al sistema, per avere una visione d'insieme di quanto, dove e come usiamo l'AI, e di quanto risparmiamo.

> La Fase 3 sarà oggetto di un'analisi dedicata a parte. È inserita qui perché la raccolta dei dati che la rende possibile (la telemetria della Fase 2) va progettata fin dall'inizio con questo obiettivo in mente.

---

## In sintesi, per la direzione

| | |
|---|---|
| **Cosa è** | Uno standard aziendale per sviluppare software con l'AI, ripetibile su ogni progetto |
| **Cosa risolve** | Processo artigianale e disomogeneo, non trasferibile, con costi AI non governati |
| **Come** | L'AI esegue, la persona decide nei punti chiave (human-in-the-loop) |
| **Su cosa si applica** | Progetti nuovi ed esistenti, con un comando |
| **Perché è solido** | Qualità garantita strutturalmente, aggiornamento centralizzato, indipendente dallo strumento |
| **Perché conviene** | Ottimizzazione dei costi AI come priorità di progettazione, con risparmio misurabile |
| **Come lo realizziamo** | In tre fasi: cuore funzionante → robustezza → analisi |

Il documento è accompagnato dal **diagramma di processo** che illustra nel dettaglio le fasi, i punti di controllo umano e i punti di automazione AI.
