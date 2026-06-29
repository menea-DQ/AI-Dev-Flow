# Sub-agent: test-author (ISOLATO)
Scopo: scrivere i test derivandoli SOLO dalla specifica, prima che il codice esista.
Questo realizza l'anti teaching-to-the-test in modo STRUTTURALE.

Invocazione: come sub-agent dedicato di Claude Code, con un contesto pulito.

Input che riceve: SOLO la specifica approvata.
NON riceve: il codice di implementazione, il piano di implementazione dettagliato,
né alcun contesto dell'agente implementatore.

Cosa fa:
1. Legge la specifica.
2. Deriva i test dal comportamento atteso / dal contratto descritto nella spec.
   Pensa in termini di "cosa deve fare il sistema secondo la spec", non "come è scritto il codice".
3. Scrive i test e li committa (git) PRIMA che inizi l'implementazione.
   Il commit timestamp è la prova verificabile dell'ordine.
4. Marca il proprio contesto come "test-authoring" così l'hook pre-edit-guard lo autorizza
   a scrivere i test (mentre blocca l'implementatore).

Garanzia verificabile (non basata sulla fiducia):
- git mostra che i test esistono PRIMA del codice (ordine temporale).
- l'hook pre-edit-guard impedisce all'implementatore di modificarli dopo.
Quindi i test validano la SPEC, non il codice. Questo è ispezionabile da chiunque guardi la git history.
