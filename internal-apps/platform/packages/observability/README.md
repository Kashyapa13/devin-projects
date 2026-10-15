# @company/observability

Namespaced metrics, schema-validated JSON logs, alert manifests.

## API

- `metricsRegistry(namespace)` — `counter` / `gauge` / `histogram`; every
  name is forced to `<namespace>_<name>` so apps can't collide on shared
  metric keys. `render()` emits Prometheus text exposition.
- `log(entry, sink?)` — emits one TypeBox-validated JSON line
  (`{ts, level, service, msg, req_id?, err?, extra?}`); schema violations
  throw. `isLogLine(v)` validates standalone (DLP scan hook).
- `alertManifest(service, alerts)` — validated manifest; `page` severity
  requires a `runbook` field.

## Usage

```ts
import { metricsRegistry, log, alertManifest } from "@company/observability";

const metrics = metricsRegistry("fastlane");
metrics.counter("queue_dequeues").inc(1, { lane: "tier1" });
log({ ts: new Date().toISOString(), level: "info", service: "fastlane", msg: "case claimed", req_id: req.id });
app.get("/metrics", (_req, reply) => reply.type("text/plain").send(metrics.render()));
```

Never log C3/C4 payloads — forbidden globally (constitution).
