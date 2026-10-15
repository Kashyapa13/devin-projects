import { describe, expect, it } from "vitest";
import { envelope } from "@company/http";
import { buildServer } from "../api/src/app.js";
import { AnswerCache } from "../api/src/cache.js";
import { defaultMetrics } from "../api/src/service.js";
import { CHEAP_PLAN, StubDb } from "./helpers/stub-db.js";

/**
 * Golden tests for the error envelope (TESTING.md §UT): every failure
 * path produces the SAME shape { error: { code, message, detail?, req_id } }
 * — byte-identical for equal inputs, so callers parse it like an SDK
 * contract. OPEN-5 pins the ONE divergence found: platform auth errors
 * (401/403) omit req_id because bearer.ts hand-rolls the body.
 */

const server = async () =>
  buildServer({
    db: new StubDb([{ match: /./, result: CHEAP_PLAN }]),
    sessionSecret: "dev-secret",
    cache: new AnswerCache(),
    metrics: defaultMetrics(),
  });

describe("error envelope golden", () => {
  it("envelope() serializes identically for the same inputs (golden)", () => {
    const a = envelope("FENCED_QUERY_REJECTED", "x", "req-fixed", { reason: "mutation" });
    const b = envelope("FENCED_QUERY_REJECTED", "x", "req-fixed", { reason: "mutation" });
    expect(a).toEqual(b);
    expect(a).toEqual({
      error: {
        code: "FENCED_QUERY_REJECTED",
        message: "x",
        req_id: "req-fixed",
        detail: { reason: "mutation" },
      },
    });
  });

  it("envelope() omits detail when undefined — key shape stays stable", () => {
    expect(envelope("UNAUTHORIZED", "nope", "r-1")).toEqual({
      error: { code: "UNAUTHORIZED", message: "nope", req_id: "r-1" },
    });
  });

  it("auth-path 401 carries code+message (req_id absent — OPEN-5 platform divergence)", async () => {
    const app = await server();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ask",
      headers: { authorization: "Bearer not-a-real-session" },
      payload: { question: "delete all refunds" },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(typeof body.error.message).toBe("string");
  });

  it("application-path errors carry the full envelope incl. req_id", async () => {
    const app = await server();
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: expect.any(String),
        req_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
  });

  it("every registered route emits error envelopes (no 5xx stack leaks)", async () => {
    const app = await server();
    for (const res of [
      await app.inject({ method: "GET", url: "/api/v1/export.csv" }),
      await app.inject({ method: "POST", url: "/api/v1/ask", payload: {} }),
      await app.inject({ method: "GET", url: "/nope" }),
    ]) {
      const body = JSON.parse(res.body);
      expect(body.error?.code, JSON.stringify(body)).toMatch(/^[A-Z_]+$/);
      expect(typeof body.error?.message).toBe("string");
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    }
  });
});
