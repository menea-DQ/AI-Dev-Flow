# Specifica — [titolo task]
ticket: [rif] · tipo: [CR|BUG] · data: [data] · stato: [bozza|approvata]

> Due parti dichiarate. La PARTE NORMATIVA è il contratto e deve essere AUTOSUFFICIENTE: il
> test-author deriva i test leggendo solo quella. La PARTE DI MOTIVAZIONE spiega il perché e non
> viene riletta dalle fasi a valle, se non per decidere fra due letture della parte normativa.

---
# PARTE NORMATIVA — il contratto

## Obiettivo
[cosa va ottenuto, in linguaggio funzionale]

## Perimetro
[dentro: cosa è compreso · fuori: cosa è esplicitamente escluso]

## Modello dati
[entità, campi, vincoli e valori ammessi toccati dal cambiamento — se non ne tocca, dichiaralo]

## Comportamento atteso
[il contratto: cosa deve fare il sistema. È la base da cui il test-author deriverà i test]

Ogni clausola porta accanto il suo OSSERVABILE: come si osserva che è rispettata (quale tipo di
test del playbook la copre, e su cosa asserisce). Una clausola senza osservabile non è una
clausola: è una domanda di gate, e va spostata fra le domande aperte.

| # | Clausola (cosa deve fare) | Osservabile (come si verifica) |
|---|---|---|
| 1 | [comportamento] | [tipo di test → su cosa asserisce] |

## Criteri di accettazione
[come si riconosce il "fatto bene", in termini verificabili]

## Constraint
[sicurezza, accessibilità, performance, se pertinenti]

## Decisioni di gate
[le questioni decise dall'utente al GATE 1, con l'esito. Verifica che nessuna renda incompleta
una sezione redatta prima di essa]

## File previsti
[elenco dei file/aree che il cambiamento prevede di toccare — serve al piano e, nei progetti
senza git, all'inventario del GATE 3]

---
# PARTE DI MOTIVAZIONE — il perché

## Contesto tecnico
[contesti/aree coinvolti, vincoli rilevanti; riferimento ai documenti di architettura letti]

## Impact analysis
[questa modifica tocca scelte deliberate passate? riferimenti alle teste "Vincolante" del changelog;
misure risalite alla fonte primaria negli inputs/ di Fase 0]

## Alternative scartate
[cosa è stato valutato e non scelto, e perché]

## Rischi e scoperte
[cosa potrebbe andare storto; ciò che è emerso leggendo il sistema]

## Domande aperte → vedi qa-log.md
