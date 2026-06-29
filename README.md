# AI-Dev Flow Kit

Standard aziendale per lo sviluppo software AI-assistito (human-in-the-loop).

> Versione **0.0.1** — prima beta. Finché siamo sotto `1.0.0` anche piccoli incrementi
> possono introdurre cambiamenti non retro-compatibili (convenzione semver per le 0.x).

## Cos'è

Il kit prende il processo di sviluppo AI-assistito e lo rende uno **standard unico,
ripetibile e configurabile**, applicabile a ogni progetto. L'AI esegue, la persona
decide nei tre punti chiave (specifica, piano, revisione del diff). La fonte di verità
del processo è [`PROCESS.md`](PROCESS.md).

## Installare su un progetto

Apri il progetto in Claude Code e invoca la skill `install`: «installa AI-Dev Flow qui».
La skill fa l'assessment, ti **intervista** sulle scelte (strategia di test, convenzioni,
connettori, documentazione), e installa adattandosi al progetto. Non serve più incollare
[`INSTALL.md`](INSTALL.md) a mano.

## Cambiare le impostazioni di un progetto

Invoca la skill `flow-settings`: «cambia come si fanno i test», «aggiungi una convenzione di
progetto», «modifica le soglie». Modifica solo i tuoi override locali (`flow.config.json`),
mai il core del kit.

## Aggiornare il kit

Aggiorna il riferimento al kit alla nuova versione e chiedi all'agente di aggiornare.
I tuoi override in `flow.config.json` non vengono toccati.

## Struttura del repo

```
ai-dev-flow/
├── README.md                  questo file
├── VERSION                    versione semantica del kit
├── PROCESS.md                 fonte di verità del processo (versionata)
├── INSTALL.md                 procedura di installazione (eseguita dalla skill `install`)
├── bin/install.mjs            installer deterministico (Node) + fallback agente
├── skills/                    skill di servizio (install, flow-settings) e di processo
├── adapters/claude-code/      parte vendor-specific: hook e sub-agent
├── templates/                 modelli degli artefatti (spec, plan, changelog, architecture, …)
└── project-files/             template di config e lock per-progetto
```

## Versione

Vedi [`VERSION`](VERSION). Versionamento semantico.
