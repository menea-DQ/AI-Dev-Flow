# Changelog / Log delle decisioni — [progetto]

> Append-only. Ogni voce ha due parti: una TESTA "Vincolante" breve (è l'unica che le fasi
> successive leggono) e una NARRATIVA sotto la barriera di lettura (la memoria del progetto: si
> scrive sempre, non si rilegge per intero).
> Inizializzato il [data]. Storia pregressa non tracciata (vedi nota in fondo).

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

---
Nota: questo changelog traccia le decisioni a partire dalla sua data di inizializzazione.
Le release/tag git precedenti sono stati importati come riferimenti strutturati.
