import Fastify from "fastify";
import pg from "pg";
import { parseSignals } from "./signals.js";
import { evaluate, stalePacks } from "./engine.js";
import { record, dailyReport, recordHumanOutcome } from "./store.js";
import { isKilled, setKillSwitch, type Db } from "./kill.js";
import { MockModelScoreProvider } from "./providers.js";

const db: Db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const provider = new MockModelScoreProvider();
const API_TOKEN = process.env.ENGINE_API_TOKEN; // service-to-service auth

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/healthz", () => ({ ok: true }));
  app.get("/readyz", async () => { await db.query("SELECT 1"); return { ok: true }; });

  /** Service auth: every /api/v1/engine/* caller presents X-Engine-Token.
      Fail closed when the secret is unset — no anonymous shadow records. */
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (!API_TOKEN || req.headers["x-engine-token"] !== API_TOKEN)
      return reply.code(401).send({ error: { code: "UNAUTHORIZED",
        message: "service token required" } });
  });

  /** SHADOW rung: evaluate a case — logs the decision, never acts on it. */
  app.post("/api/v1/engine/decide", async (req, reply) => {
    if (await isKilled(db))
      return reply.code(503).send({ error: { code: "ENGINE_KILLED",
        message: "kill switch engaged — all cases route to humans" } });
    const parsed = parseSignals(req.body);
    if (!parsed.ok)
      return reply.code(400).send({ error: { code: "SIGNAL_VERSION",
        message: parsed.error } });            // clean rejection, never guessing
    // preserve caller-provided scores; append the clearly-labeled mock
    parsed.signals.ml_scores.push(...await provider.scoresFor(parsed.signals.case_id));
    const d = evaluate(parsed.signals);
    await record(db, d);                      // inputs + pack version + fired rule + confidence
    return { shadow: true, decision: d.decision, reason: d.reason_code,
      pack: `${d.pack_id}@${d.pack_version}`, rule: d.fired_rule,
      confidence: d.confidence };
  });

  /** Human outcome snapshot — feeds SHADOW disagreement measurement. */
  app.post("/api/v1/engine/human-outcome", async (req, reply) => {
    const b = req.body as { case_id?: string; outcome?: string; reason?: string };
    if (typeof b?.case_id !== "string" || typeof b?.outcome !== "string")
      return reply.code(400).send({ error: { code: "BAD_INPUT", message: "case_id + outcome required" } });
    await recordHumanOutcome(db, b.case_id, b.outcome, b.reason);
    return { ok: true };
  });

  /** One-click kill switch — freezes in-flight decisions for supervisor review. */
  app.post("/api/v1/engine/kill-switch", async () => {
    await setKillSwitch(db, true);
    return { killed: true, mode: "all-human", frozen: "in-flight decisions frozen for supervisor review" };
  });
  app.post("/api/v1/engine/kill-switch/release", async () => {
    await setKillSwitch(db, false);
    return { killed: false };
  });

  /** Daily shadow report: decisions by band, confidence distribution,
      human disagreement (missing humans counted explicitly). */
  app.get("/api/v1/engine/reports/daily", async (req) => {
    const day = (req.query as { day?: string }).day ?? new Date().toISOString().slice(0, 10);
    return dailyReport(db, day);
  });

  /** Stale-pack alert surface (>90d untouched → writer alert). */
  app.get("/api/v1/engine/stale-packs", () => ({ stale: stalePacks().map((p) => p.id) }));
  return app;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js"))
  buildApp().listen({ port: Number(process.env.PORT ?? 8081), host: "0.0.0.0" });
