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

L'`install` del kit scrive nel `.claude/settings.json` **del progetto** un blocco `env` che abilita
l'OTEL nativo di Claude Code **solo in quel progetto** (le altre chat dell'utente non sono toccate):

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://<host>:4318",
    "OTEL_SERVICE_NAME": "ai-dev-flow",
    "OTEL_RESOURCE_ATTRIBUTES": "project.name=<nome-progetto>"
  }
}
```

L'endpoint è preconfigurato in `flow.config.telemetry.otlpEndpoint` (default `http://localhost:4318`,
da puntare all'host dello stack). L'utilizzatore del kit non configura nulla. `flow.config.telemetry.enabled = false`
disattiva la telemetria per quel progetto. L'`uninstall` rimuove queste variabili.

## Visualizzazione

In Grafana → Explore → datasource Prometheus → query sulle metriche `claude_code_*` (token, costo,
sessioni), filtrabili per `project_name` e `user_email`. Le dashboard avanzate sono Fase 3.
