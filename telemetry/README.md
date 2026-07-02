# Telemetria — stack OTLP + Grafana

La telemetria di AI-Dev Flow **non usa un connettore o un DB custom**: sfrutta l'**OpenTelemetry nativo
di Claude Code**, che è l'unica fonte *accurata* di token/costo (gli hook non li espongono; il transcript
li sottostima ~100×). Claude Code esporta in **OTLP**, quindi il backend è uno **stack OTLP standard**.

L'OTLP è anche il **layer agnostico/sostituibile**: per cambiare backend basta puntare l'endpoint OTLP
altrove (Grafana Cloud, Datadog, Honeycomb, uno stack esplicito…), senza riscrivere nulla nel kit.

## Cosa cattura (solo metriche/metadati, niente contenuti)

Dalle metriche `claude_code.*`: `token.usage` (input/output/cache), `cost.usage` (USD),
`session.count`, `lines_of_code.count`, `commit.count`. Attributi: `session.id`, `user.id`,
`user.email` (attore **non anonimo**), `service.name`, e `project.name` (nome progetto **non anonimo**,
iniettato via `OTEL_RESOURCE_ATTRIBUTES`). **Nessun contenuto** di prompt/codice: il logging dei prompt
(`OTEL_LOG_USER_PROMPTS`) resta spento.

## Lo stack (pilota)

`docker-compose.yml` usa l'immagine all-in-one **`grafana/otel-lgtm`**: riceve OTLP (4317 gRPC / 4318 HTTP)
e include Prometheus + Loki + Tempo + **Grafana** già cablati.

```bash
cd telemetry
docker compose up -d
# Grafana:        http://<host>:3000   (login iniziale admin / admin)
# Endpoint OTLP:  http://<host>:4318   (è ciò che i progetti devono vedere)
```

I dati persistono nel volume `telemetry-data`. Per retention industriale e aggregazione cross-progetto
(Fase 3) si passerà a uno stack esplicito (OTEL Collector + Prometheus/Mimir + Grafana con storage durevole).

## Come i progetti inviano i dati (per-progetto, mai globale)

Abilitare l'OTEL di Claude Code è una config di **startup**: l'`env` di `.claude/settings.json` NON la
attiva (la doc avverte che certe variabili di avvio vanno nell'ambiente reale prima di lanciare `claude`).
Per restare **per-progetto** senza renderla globale, l'`install` scrive un **`.envrc`** (direnv) nel
progetto: entrando nella cartella le variabili si attivano, uscendo si disattivano.

```bash
# .envrc (generato dall'install, tra i marcatori # >>> ai-dev-flow telemetry >>> ... <<<)
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT=http://<host>:4318
export OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative
export OTEL_SERVICE_NAME=ai-dev-flow
export OTEL_RESOURCE_ATTRIBUTES=project.name=<nome-progetto>
export OTEL_METRIC_EXPORT_INTERVAL=10000
```

`OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative` è **necessaria**: Prometheus (e quindi
otel-lgtm) accetta solo metriche con temporalità cumulativa; senza, le metriche non compaiono.

Le stesse variabili vengono scritte **anche** in `.claude/settings.json` (`env`), oltre che nel `.envrc`:
il `.envrc` è ciò che le attiva nel processo `claude` al lancio (config di startup), mentre settings.json
le rende disponibili ai sottoprocessi/strumenti e tiene la config visibile nel repo.

Requisiti: **direnv installato** + un `direnv allow` iniziale nel progetto; poi è trasparente. Lancia
`claude` dalla cartella del progetto (così eredita le variabili). L'endpoint è preconfigurato in
`flow.config.telemetry.otlpEndpoint` (default `http://localhost:4318`). `flow.config.telemetry.enabled = false`
disattiva. L'`uninstall` rimuove il blocco dal `.envrc` e le variabili da settings.json.

Nota team: committa il `.envrc` per condividerlo coi colleghi (non contiene segreti — solo l'endpoint);
ognuno esegue `direnv allow` una volta. Senza committarlo, la telemetria resta solo sulla tua macchina.

## Visualizzazione

In Grafana → Explore → datasource Prometheus → query sulle metriche `claude_code_*` (token, costo,
sessioni), filtrabili per `project_name` e `user_email`. Le dashboard avanzate sono Fase 3.

## Costo reale vs valore equivalente

`claude_code.cost.usage` è **sempre** calcolato da Claude Code a pricing API a consumo (list price per
token), indipendentemente da come l'utente accede. Nella nostra azienda non tutti pagano così:

- chi fa **login con un abbonamento Claude.ai (Pro/Max)** paga una **quota fissa mensile**, con la quota
  di utilizzo applicata via rate-limit/blocco — non esiste un vero overage a pagamento in dollari;
- chi usa una **API key Anthropic Console** paga davvero a consumo: qui `cost.usage` È il costo reale.

Per chi è in abbonamento, `cost.usage` non è quindi il costo fatturato all'azienda: è solo un indicatore
di **quanto valore/utilizzo** quella persona sta consumando rispetto al piano (utile per capire chi si
sta avvicinando ai limiti, non per il budget).

Per avere entrambe le viste si usa un piccolo exporter Prometheus aggiuntivo:

- **`plans.json`** — mappatura versionata `user_email → plan/billing_type/monthly_cost_usd`. Aggiornalo
  quando un dipendente cambia piano (nuovo Pro/Max) o passa a/da API key. `billing_type` è `subscription`
  o `api_key` (per `api_key` lascia `monthly_cost_usd: 0`, il costo reale è già `cost.usage`).
- **`plan-exporter.mjs`** — legge `plans.json` e serve `http://plan-exporter:9105/metrics` con la gauge
  `ai_dev_flow_plan_cost_monthly_usd{user_email,plan,billing_type}`.
- **`prometheus.yaml`** — montato su `/otel-lgtm/prometheus.yaml` nel container `otel-lgtm` (di default
  l'immagine non ha `scrape_configs`, ingerisce solo via OTLP/remote-write): aggiunge lo scrape job verso
  `plan-exporter:9105`.

Query PromQL per i due pannelli (Grafana, datasource Prometheus):

```promql
# B — Utilizzo / valore equivalente (con etichetta piano)
sum by (user_email, plan, billing_type) (
  increase(claude_code_cost_usage_total[$__range])
) * on(user_email) group_left(plan, billing_type) (ai_dev_flow_plan_cost_monthly_usd * 0 + 1)

# A — Costo reale fatturato (proroga mensile approssimata a 30.44 giorni)
sum by (user_email, plan, billing_type) (
  (
    increase(claude_code_cost_usage_total[$__range])
    * on(user_email) group_left(plan, billing_type) (ai_dev_flow_plan_cost_monthly_usd{billing_type="api_key"} * 0 + 1)
  )
  or
  (
    ai_dev_flow_plan_cost_monthly_usd{billing_type="subscription"} * ($__range_s / 86400 / 30.44)
  )
)
```
