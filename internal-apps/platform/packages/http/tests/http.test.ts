import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.js";
import { httpPlugin, REQUEST_ID_HEADER } from "../src/plugin.js";
import { rateLimitPresets } from "../src/rateLimit.js";

async function makeApp(deps: Record<string, () => Promise<unknown>> = {}) {
  const app = Fastify({ logger: false });
  await app.register(httpPlugin, { readiness: deps });
  return app;
}

describe("error envelope", () => {
  it("wraps ApiError as {error:{code,message,req_id}}", async () => {
    const app = await makeApp();
    app.get("/boom", () => {
      throw new ApiError("NOT_FOUND", "case missing", 404, { id: "c-1" });
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(404);
    const body = res.json() as {
      error: { code: string; message: string; detail: { id: string }; req_id: string };
    };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.detail).toEqual({ id: "c-1" });
    expect(body.error.req_id).toMatch(/./);
  });

  it("threads an incoming X-Request-ID into the envelope and response", async () => {
    const app = await makeApp();
    app.get("/boom", () => {
      throw new ApiError("INTERNAL", "x");
    });
    const res = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { [REQUEST_ID_HEADER]: "req-fixed-1" },
    });
    expect(res.headers[REQUEST_ID_HEADER]).toBe("req-fixed-1");
    expect((res.json() as { error: { req_id: string } }).error.req_id).toBe(
      "req-fixed-1",
    );
  });
});

describe("rate limiting", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  afterEach(() => app.close());

  it("auth preset: 6th hit per IP → 429 envelope", async () => {
    app = await makeApp();
    app.post(
      "/login",
      { config: { rateLimit: rateLimitPresets.auth } },
      () => ({ ok: true }),
    );
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/login",
        remoteAddress: "10.0.0.9",
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });

  it("429s carry the standard envelope", async () => {
    app = await makeApp();
    app.post(
      "/login",
      { config: { rateLimit: rateLimitPresets.auth } },
      () => ({ ok: true }),
    );
    let body: { error?: { code?: string } } = {};
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/login",
        remoteAddress: "10.0.0.10",
      });
      body = res.json() as typeof body;
    }
    expect(body.error?.code).toBe("RATE_LIMITED");
  });
});

describe("health endpoints", () => {
  it("healthz answers 200 with no deps", async () => {
    const app = await makeApp();
    const res = await app.inject("/healthz");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("readyz 200 when all deps pass, 503 naming failures", async () => {
    const up = await makeApp({
      db: async () => 1,
      kms: async () => "ok",
    });
    expect((await up.inject("/readyz")).statusCode).toBe(200);
    await up.close();

    const down = await makeApp({
      db: async () => {
        throw new Error("connection refused");
      },
      kms: async () => "ok",
    });
    const res = await down.inject("/readyz");
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "not_ready",
      failing: ["db"],
    });
    await down.close();
  });
});
