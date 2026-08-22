# Documentazione di design — AI-Dev Flow

Materiale di progettazione e presentazione del kit. La **fonte di verità operativa** resta il codice
del repo (manifest, skill, hook, `PROCESS.md`, `INSTALL.md`); questi documenti sono la vista d'insieme
e il razionale.

## Contenuto

- [`AI_Dev_Flow_Manuale.md`](AI_Dev_Flow_Manuale.md) — **manuale di progetto** (il documento da cui
  partire): obiettivo e filosofia, le 6 fasi del flusso con i contratti input/output tra fase e fase,
  vincoli dello standard, convenzioni, esempi d'uso end-to-end, best practice e limiti dichiarati.
- [`AI Dev Flow V5.drawio`](AI%20Dev%20Flow%20V5.drawio) — **diagramma di processo corrente**,
  ricreato da zero: le 6 fasi, i 3 gate umani, lo stato per-task, i guardiani (hook), gli agenti
  per fase con il modello dedicato, il perimetro enforced.
- [`Moduli_di_contesto.md`](Moduli_di_contesto.md) — **BOZZA in lavorazione**: i moduli di contesto
  del flusso (perché contano, difficoltà, tipologie), agnostici da tool e implementazione. Base
  progettuale per la prossima iterazione, centrata sul flusso più che sulla sua implementazione.

Artefatti storici e di lavoro (non documentazione di prodotto) sono in
[`archive/`](archive/): la gap analysis (chiusa), la presentazione per il team e il diagramma V4
a 5 fasi (pre-0.0.7).

> I `.drawio` si aprono con [draw.io](https://app.diagrams.net) o l'estensione Draw.io di VS Code.
