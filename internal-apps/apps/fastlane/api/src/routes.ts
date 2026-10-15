import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError, rateLimitPresets } from "@company/http";
import { requireRole } from "@company/auth";
import * as svc from "./services.js";

export interface RouteDeps extends svc.Deps {
  cronSecret: string;
}

/** The API registry — LLD's registry and openapi.yaml derive from this. */
export const REGISTRY = [
  { method: "GET", path: "/api/v1/queue", roles: ["reviewer", "supervisor"], summary: "Queue tabs (mine/team/breaching), cursor paginated" },
  { method: "GET", path: "/api/v1/cases/:id", roles: ["reviewer", "supervisor"], summary: "One case, C4 masked" },
  { method: "POST", path: "/api/v1/cases/:id/claim", roles: ["reviewer", "supervisor"], idempotent: true, summary: "PENDING→IN_REVIEW claim (supervisor claims ESCALATED)" },
  { method: "POST", path: "/api/v1/cases/:id/approve", roles: ["reviewer", "supervisor"], idempotent: true, summary: "IN_REVIEW→APPROVED, assignee only" },
  { method: "POST", path: "/api/v1/cases/:id/reject", roles: ["reviewer", "supervisor"], idempotent: true, summary: "IN_REVIEW→REJECTED, reason ≥20 chars" },
  { method: "POST", path: "/api/v1/cases/:id/escalate", roles: ["reviewer", "supervisor"], idempotent: true, summary: "IN_REVIEW→ESCALATED" },
  { method: "POST", path: "/api/v1/cases/:id/note", roles: ["reviewer", "supervisor"], idempotent: true, summary: "Append a case note (C3)" },
  { method: "POST", path: "/api/v1/cases/:id/reveal", roles: ["reviewer", "supervisor"], idempotent: true, summary: "Audited unmask of legal_name" },
  { method: "GET", path: "/api/v1/cases/:id/audit", roles: ["reviewer", "supervisor", "admin"], summary: "Audit rows for one case" },
  { method: "GET", path: "/api/v1/audit", roles: ["supervisor", "admin"], summary: "Audit export (latest 500)" },
  { method: "GET", path: "/api/v1/cases/:id/doc-url", roles: ["reviewer", "supervisor"], summary: "Signed doc URL, 15-min expiry" },
  { method: "POST", path: "/api/v1/cron/sla-digest", roles: [], cron: true, summary: "SLA breach digest (service)" },
  { method: "GET", path: "/metrics", roles: [], summary: "Prometheus text exposition (ops)" },
] as const;

const userOf = (req: FastifyRequest): svc.Actor => {
  const u = req.user;
  if (!u) throw new ApiError("UNAUTHORIZED", "authentication required", 401);
  return { sub: String(u.sub), roles: u.roles };
};

const reqId = (req: FastifyRequest): string => String(req.reqId ?? "");

const IdemBody = Type.Object({});

/** Idempotency-Key required on every mutation; replays return the original.
 * `cache: false` keeps the key requirement but never replays — each call
 * executes (and audits) fresh. Used by /reveal: a replayed response would
 * re-disclose C4 plaintext with no new audit row (verifier breach). */
async function idempotent<T>(
  deps: RouteDeps,
  req: FastifyRequest,
  run: () => Promise<T>,
  opts: { cache?: boolean } = {},
): Promise<T | { replayed: true; result: unknown }> {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8) {
    throw new ApiError(
      "IDEMPOTENCY_REQUIRED",
      "mutations need an Idempotency-Key header (any stable unique value)",
      400,
    );
  }
  const actor = userOf(req);
  if (opts.cache === false) return run();
  const found = await deps.db.query(
    "SELECT response FROM idempotency_keys WHERE key = $1",
    [`${actor.sub}:${key}`],
  );
  const hit = (found as { rows?: { response: unknown }[] }).rows?.[0];
  if (hit) return { replayed: true, result: hit.response };
  const result = await run();
  await deps.db.query(
    "INSERT INTO idempotency_keys (key, user_id, response) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING",
    [`${actor.sub}:${key}`, actor.sub, JSON.stringify(result)],
  );
  return result;
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const roleGate = (roles: readonly string[]) =>
    requireRole(...(roles as ("reviewer" | "supervisor" | "admin")[]));

  // Observable gauges (ADR-0017): per-status active-case counts and the
  // SLA breach count, re-probed every OTLP collection + /metrics tick.
  deps.metrics.observableGaugeSeries("cases_active", async () => {
    const res = await deps.db.query(
      `SELECT status, COUNT(*)::float AS n FROM kyc_cases GROUP BY status`,
    );
    const rows = (res as { rows?: { status: string; n: number }[] }).rows ?? [];
    return rows.map((r) => ({ value: Number(r.n), labels: { status: r.status } }));
  });
  deps.metrics.observableGauge("sla_breach_count", async () => {
    const res = await deps.db.query(
      `SELECT COUNT(*)::float AS n FROM kyc_cases
       WHERE status IN ('PENDING','IN_REVIEW','ESCALATED') AND sla_due_at < now()`,
    );
    const rows = (res as { rows?: { n: number }[] }).rows ?? [];
    return Number(rows[0]?.n ?? 0);
  });

  app.get("/metrics", async () => deps.metrics.render());

  app.get(
    "/api/v1/queue",
    {
      config: { rateLimit: rateLimitPresets.read },
      preHandler: roleGate(["reviewer", "supervisor", "admin"]),
    },
    async (req) => {
      const q = req.query as { tab?: string; cursor?: string; limit?: string };
      return svc.listQueue(deps, {
        tab: q.tab ?? "team",
        cursor: q.cursor,
        limit: Math.min(Number(q.limit ?? 25), 100),
        actor: userOf(req),
      });
    },
  );

  app.get(
    "/api/v1/cases/:id",
    { config: { rateLimit: rateLimitPresets.read }, preHandler: roleGate(["reviewer", "supervisor", "admin"]) },
    async (req) => svc.getCase(deps, (req.params as { id: string }).id),
  );

  const mutation = (
    path: string,
    run: (req: FastifyRequest) => Promise<unknown>,
    body?: typeof IdemBody | ReturnType<typeof Type.Object>,
    idemOpts?: { cache?: boolean },
  ) =>
    app.post(
      path,
      {
        ...(body === undefined ? {} : { schema: { body } }),
        config: { rateLimit: rateLimitPresets.mutation },
        preHandler: roleGate(["reviewer", "supervisor"]),
      },
      async (req, reply) => {
        const out = await idempotent(deps, req, () => run(req), idemOpts);
        return reply.send(
          (out as { replayed?: boolean }).replayed === true
            ? (out as { result: unknown }).result
            : out,
        );
      },
    );

  mutation("/api/v1/cases/:id/claim", (req) =>
    svc.transition(deps, (req.params as { id: string }).id, "IN_REVIEW", userOf(req), { reqId: reqId(req), version: (req.body as { expected_version?: number } | undefined)?.expected_version }),
  );

  mutation("/api/v1/cases/:id/approve", (req) =>
    svc.transition(deps, (req.params as { id: string }).id, "APPROVED", userOf(req), { reqId: reqId(req), version: (req.body as { expected_version?: number } | undefined)?.expected_version }),
  );

  mutation(
    "/api/v1/cases/:id/reject",
    (req) =>
      svc.transition(deps, (req.params as { id: string }).id, "REJECTED", userOf(req), {
        reason: (req.body as { reason?: string }).reason,
        reqId: reqId(req),
      }),
    Type.Object({ reason: Type.Optional(Type.String()) }),
  );

  mutation("/api/v1/cases/:id/escalate", (req) =>
    svc.transition(deps, (req.params as { id: string }).id, "ESCALATED", userOf(req), { reqId: reqId(req), version: (req.body as { expected_version?: number } | undefined)?.expected_version }),
  );

  mutation(
    "/api/v1/cases/:id/note",
    (req) =>
      svc.addNote(deps, (req.params as { id: string }).id, userOf(req), (req.body as { body: string }).body, reqId(req)),
    Type.Object({ body: Type.String({ minLength: 1 }) }),
  );

  // cache:false — every reveal is a real disclosure, so every call writes
  // its own audit row. A cached replay would leak C4 off the books.
  mutation(
    "/api/v1/cases/:id/reveal",
    (req) =>
      svc.reveal(deps, (req.params as { id: string }).id, userOf(req), reqId(req)),
    undefined,
    { cache: false },
  );

  app.get(
    "/api/v1/cases/:id/audit",
    { config: { rateLimit: rateLimitPresets.read }, preHandler: roleGate(["reviewer", "supervisor", "admin"]) },
    async (req) =>
      svc.caseAudit(deps, (req.params as { id: string }).id),
  );

  app.get(
    "/api/v1/audit",
    { config: { rateLimit: rateLimitPresets.read }, preHandler: roleGate(["supervisor", "admin"]) },
    async () => svc.allAudit(deps),
  );

  app.get(
    "/api/v1/cases/:id/doc-url",
    { config: { rateLimit: rateLimitPresets.read }, preHandler: roleGate(["reviewer", "supervisor"]) },
    async (req) =>
      svc.docUrl(deps, (req.params as { id: string }).id, userOf(req), reqId(req)),
  );

  app.post("/api/v1/cron/sla-digest", { config: { rateLimit: rateLimitPresets.mutation } }, async (req, reply) => {
    if (req.headers["x-cron-secret"] !== deps.cronSecret) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "invalid cron credential" },
      });
    }
    return svc.slaDigest(deps);
  });
}
