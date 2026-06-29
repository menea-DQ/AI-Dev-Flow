# Skill: flow-settings
Scopo: modificare le impostazioni per-progetto del kit (flow.config.json) in modo guidato,
senza che l'utente debba editare il JSON a mano.

Quando usarla: l'utente dice "cambia come si fanno i test", "aggiorna le impostazioni del flow",
"aggiungi una convenzione di progetto", "modifica le soglie", "cambia connettore".

Cosa fare:
1. Leggi il flow.config.json corrente del progetto. Mostra all'utente la sezione pertinente.
2. Chiedi cosa vuole cambiare. Aree modificabili:
   - testPlaybook: aggiungi/modifica/rimuovi un tipo di test (comando per lanciarlo + quando si applica).
   - projectConventions: aggiungi/modifica una convenzione o preferenza ("suggerimento di progetto"
     che l'impl-runbook applicherà).
   - architectureDocs: registra/diregistra un contesto e il path del suo documento di architettura.
   - maxRefine, fastPath, connectors, tokenEconomy: soglie e opzioni.
3. Valida la modifica contro lo schema di flow.config. Se una scelta è ambigua, applica la Regola
   del 98% e CHIEDI; non indovinare.
4. Scrivi SOLO flow.config.json. NON toccare mai il core del kit, né gli artefatti di lavoro
   (spec/changelog), né i file di test.
5. Mostra un diff prima di salvare e chiedi conferma. Riepiloga l'effetto pratico della modifica
   (es. "d'ora in poi le modifiche ai file *.sql faranno scattare il data-diff").

Output: flow.config.json aggiornato (solo gli override locali) + riepilogo dell'effetto.

Confine netto: questa skill governa la CONFIGURAZIONE del progetto, non il PROCESSO del kit.
Il processo si cambia aggiornando il kit centrale (e la sua versione), non da qui.
