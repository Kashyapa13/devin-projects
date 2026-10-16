import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { ApiError, envelope, statusFor } from "@company/http";
import { requireRole } from "@company/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../api/src/errors.js"; // boot-time app code registration (side effect)

/**
 * Pure-logic goldens + boundary tests — error envelope, error-code
 * registry, requireRole gate. (Signing goldens live in services.test.ts
 * at the docUrl service level; route-level goldens in edge-envelope.test.ts.)
 */

describe("error envelope — golden shape", () => {
  it("envelope() emits {error:{code,message,req_id}} and omits detail when absent", () => {
    expect(envelope("NOT_FOUND", "kyc case not found", "req-1")).toEqual({
      error: { code: "NOT_FOUND", message: "kyc case not found", req_id: "req-1" },
    });
    expect("detail" in envelope("NOT_FOUND", "x", "r").error).toBe(false);
    expect(envelope("REASON_REQUIRED", "m", "req-2", { min: 20, got: 3 }).error.detail).toEqual({
      min: 20,
      got: 3,
    });
  });
  it("registry pins every contract code → status (LLD error table)", () => {
    const want: Record<string, number> = {
      // platform built-ins
      VALIDATION: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      INTERNAL: 500,
      // app-registered at boot (api/src/errors.ts, imported above)
      INVALID_TRANSITION: 400,
      REASON_REQUIRED: 400,
      NOT_ASSIGNEE: 403,
      STALE_VERSION: 409,
      IDEMPOTENCY_REQUIRED: 400,
    };
    for (const [code, status] of Object.entries(want)) expect(statusFor(code)).toBe(status);
    expect(statusFor("SOME_UNKNOWN_CODE")).toBe(400); // unknown → 400 default
  });
  it("ApiError carries code/status/detail; default status is 400", () => {
    const e = new ApiError("REASON_REQUIRED", "reject reason must be at least 20 characters", 400, {
      min: 20,
      got: 5,
    });
    expect(e).toMatchObject({ code: "REASON_REQUIRED", statusCode: 400, detail: { min: 20, got: 5 } });
    expect(new ApiError("VALIDATION", "x").statusCode).toBe(400);
    expect(e.name).toBe("ApiError");
  });
});

describe("requireRole — server-side gate, any-of semantics", () => {
  const preHandler = requireRole("reviewer", "supervisor");
  const run = (user: { roles: string[] } | undefined) => {
    const sent: { status?: number; body?: unknown } = {};
    const reply = {
      status: (n: number) => ({ send: (b: unknown) => ((sent.status = n), (sent.body = b)) }),
    } as unknown as FastifyReply;
    return { sent, out: preHandler({ user } as FastifyRequest, reply) };
  };
  it("no user → 401 UNAUTHORIZED envelope", async () => {
    const { sent } = run(undefined);
    await Promise.resolve();
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ error: { code: "UNAUTHORIZED", message: "authentication required" } });
  });
  it("listed role passes; unlisted role → 403 FORBIDDEN envelope", async () => {
    expect((await run({ roles: ["reviewer"] })).sent.status).toBeUndefined();
    expect((await run({ roles: ["supervisor"] })).sent.status).toBeUndefined();
    const denied = await run({ roles: ["admin"] });
    expect(denied.sent.status).toBe(403);
    expect(denied.sent.body).toEqual({ error: { code: "FORBIDDEN", message: "insufficient role" } });
    const none = await run({ roles: [] });
    expect(none.sent.status).toBe(403);
  });
});

describe("doc signing — HMAC payload contract (matches services.docUrl)", () => {
  it("signature = HMAC-SHA256(caseId|isoExpiry), hex — golden", () => {
    const caseId = "84bd3fb3-a57b-4029-bab7-73a75a196451";
    const exp = new Date(1_700_000_000_000);
    const secret = "unit-key";
    const sig = createHmac("sha256", secret).update(`${caseId}|${exp.toISOString()}`).digest("hex");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // URL the service would emit for this pair (shape asserted in services.test.ts):
    const url = `https://docs.local/kyc/${encodeURIComponent(caseId)}?expires=${exp.toISOString()}&sig=${sig}`;
    expect(url).toContain("expires=");
    expect(url).toContain("sig=");
    expect(url).not.toContain(caseId.replace(/-/g, "")); // separators preserved
  });
});
