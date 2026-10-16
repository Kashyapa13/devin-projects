# @company/http

Fastify platform plugin: error envelope, `X-Request-ID`, rate-limit
presets, health probes.

## API

- `httpPlugin` — registers onRequest req-id threading, a setErrorHandler
  producing `{error:{code,message,detail?,req_id}}`, `@fastify/rate-limit`
  (per-route), `GET /healthz`, `GET /readyz`.
- `ApiError(code, message, statusCode?, detail?)` — throw from handlers.
- `errorCodeRegistry` / `registerErrorCode(code, status)` — the code→status
  map is the stable API contract.
- `rateLimitPresets` — `auth` (5/min/IP) · `mutation` (60/min/user) ·
  `read` (300/min/user); attach via route `config.rateLimit`.
- `REQUEST_ID_HEADER` — `x-request-id`; honored inbound, generated
  outbound, threaded into every envelope.

## Usage

```ts
import Fastify from "fastify";
import { httpPlugin, ApiError, rateLimitPresets } from "@company/http";

const app = Fastify();
await app.register(httpPlugin, {
  readiness: {
    db: () => pool.query("SELECT 1"),
    kms: () => kms.ping(),
  },
});
app.post("/login", { config: { rateLimit: rateLimitPresets.auth } }, login);
app.get("/cases", { config: { rateLimit: rateLimitPresets.read } }, listCases);
```

healthz = liveness only (never touches deps); readyz = every declared dep
must answer, failures return 503 naming the failing deps.
