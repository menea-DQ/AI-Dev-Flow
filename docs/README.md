# Documentazione di design — AI-Dev Flow

Materiale di progettazione e presentazione del kit. La **fonte di verità operativa** resta il codice
del repo (manifest, skill, hook, `PROCESS.md`, `INSTALL.md`); questi documenti sono la vista d'insieme
e il razionale.

## Contenuto

- [`AI_Dev_Flow_Manuale.md`](AI_Dev_Flow_Manuale.md) — **manuale di progetto** (il documento da cui
  partire): obiettivo e filosofia, le 5 fasi del flusso con i contratti input/output tra fase e fase,
  vincoli dello standard, convenzioni, esempi d'uso end-to-end, best practice e limiti dichiarati.
- [`AI_Dev_Flow_Gap_Analysis.md`](AI_Dev_Flow_Gap_Analysis.md) — gap analysis: i buchi tra processo
  dichiarato e implementazione, con severità e proposta di soluzione per ciascuno.
  **CHIUSA: implementata nella 0.0.7/0.0.8** (conservata come razionale delle scelte; in 0.0.8:
  GAP-17, sequencer deterministico + abort).
- [`AI Dev Flow V5.drawio`](AI%20Dev%20Flow%20V5.drawio) — **diagramma di processo corrente (0.0.7)**,
  ricreato da zero: le 6 fasi, i 3 gate umani, lo stato per-task, i guardiani (hook), gli agenti
  per fase con il modello dedicato, il perimetro enforced.
- [`AI_Dev_Flow_Presentazione_Team.pptx`](AI_Dev_Flow_Presentazione_Team.pptx) — presentazione
  tecnica per il team (0.0.7): cosa è, come si usa, cosa è garantito.
- [`AI Dev Flow V4.drawio`](AI%20Dev%20Flow%20V4.drawio) — diagramma di processo (versione
  precedente, storica: 5 fasi, pre-0.0.7).

> I `.drawio` si aprono con [draw.io](https://app.diagrams.net) o l'estensione Draw.io di VS Code.
