import { describe, expect, it } from "vitest";
import { buildServer } from "../api/src/server.js";

describe("health routes via @company/http", () => {
  it("healthz returns ok and threads X-Request-ID", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "req-42" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBe("req-42");
    await app.close();
  });

  it("readyz is 503 while any dependency is down", async () => {
    const bad = await buildServer({
      readiness: { db: () => Promise.reject(new Error("down")) },
    });
    const res = await bad.inject("/readyz");
    expect(res.statusCode).toBe(503);
    expect(res.json().failing).toContain("db");
    await bad.close();

    const good = await buildServer({
      readiness: { db: () => Promise.resolve() },
    });
    expect((await good.inject("/readyz")).statusCode).toBe(200);
    await good.close();
  });

  it("404s come back in the platform error envelope", async () => {
    const app = await buildServer();
    const res = await app.inject("/definitely-missing");
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.req_id).toBeTruthy();
    await app.close();
  });
});
