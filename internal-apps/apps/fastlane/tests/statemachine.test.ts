import { describe, expect, it } from "vitest";
import {
  STATUSES,
  TRANSITIONS,
  canTransition,
  type ActorCtx,
  type Status,
} from "../api/src/statemachine.js";

const reviewer: ActorCtx = { sub: "u-rev", roles: ["reviewer"] };
const supervisor: ActorCtx = { sub: "u-sup", roles: ["supervisor"] };
const admin: ActorCtx = { sub: "u-adm", roles: ["admin"] };
const viewer: ActorCtx = { sub: "u-vwr", roles: ["viewer"] };
const multiRole: ActorCtx = { sub: "u-multi", roles: ["viewer", "reviewer"] };
const noRoles: ActorCtx = { sub: "u-none", roles: [] };
const OTHER = "u-other";

const run = (
  from: Status,
  to: Status,
  actor: ActorCtx,
  assigneeId: string | null,
  reason?: string,
) => () => canTransition({ from, to, actor, assigneeId, reason });

describe("statemachine — the ONLY legal transitions (gate: §7.2)", () => {
  // Table-driven both directions: every legal edge × every allowed role.
  const LEGAL: {
    from: Status;
    to: Status;
    roles: ActorCtx[];
    assigns: boolean;
    needReason?: string;
    note: string;
  }[] = [
    { from: "PENDING", to: "IN_REVIEW", roles: [reviewer, supervisor, multiRole], assigns: true, note: "claim assigns the actor" },
    { from: "IN_REVIEW", to: "APPROVED", roles: [reviewer, supervisor, multiRole], assigns: false, note: "assignee approves" },
    { from: "IN_REVIEW", to: "REJECTED", roles: [reviewer, supervisor, multiRole], assigns: false, needReason: "x".repeat(20), note: "assignee rejects with reason" },
    { from: "IN_REVIEW", to: "ESCALATED", roles: [reviewer, supervisor, multiRole], assigns: false, note: "assignee escalates" },
    { from: "ESCALATED", to: "IN_REVIEW", roles: [supervisor], assigns: true, note: "supervisor reopen claims" },
  ];
  for (const e of LEGAL) {
    for (const actor of e.roles) {
      it(`allows ${e.from}→${e.to} as ${actor.roles.join("+")} (${e.note})`, () => {
        expect(run(e.from, e.to, actor, actor.sub, e.needReason)()).toEqual({
          assigns: e.assigns,
        });
      });
    }
  }

  // The reverse of every legal edge is illegal (both directions tested).
  const ILLEGAL: [Status, Status][] = STATUSES.flatMap((f) =>
    STATUSES.filter(
      (t) => !TRANSITIONS.some((e) => e.from === f && e.to === t),
    ).map((t) => [f, t] as [Status, Status]),
  );
  it("covers all 20 illegal edges", () => expect(ILLEGAL.length).toBe(20));
  for (const [f, t] of ILLEGAL) {
    it(`rejects ${f}→${t} with 400 INVALID_TRANSITION`, () => {
      for (const actor of [reviewer, supervisor, admin]) {
        expect(run(f, t, actor, actor.sub)).toThrowError(
          expect.objectContaining({
            code: "INVALID_TRANSITION",
            statusCode: 400,
          }),
        );
      }
    });
  }
  it("rejects APPROVED→PENDING (decisions are final) with 409-capable 400", () => {
    expect(run("APPROVED", "PENDING", supervisor, supervisor.sub)).toThrowError(
      expect.objectContaining({ code: "INVALID_TRANSITION", statusCode: 400 }),
    );
  });
  it("rejects the reverse of every legal edge (e.g. IN_REVIEW→PENDING)", () => {
    for (const e of TRANSITIONS) {
      if (TRANSITIONS.some((x) => x.from === e.to && x.to === e.from)) continue;
      expect(run(e.to, e.from, supervisor, supervisor.sub)).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    }
  });
  it("rejects self-transitions (PENDING→PENDING etc.) as INVALID_TRANSITION", () => {
    for (const s of STATUSES) {
      expect(run(s, s, reviewer, reviewer.sub)).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    }
  });

  // Role matrix: every edge × every denied role → 403 FORBIDDEN.
  const DENIED: { from: Status; to: Status; actor: ActorCtx; note: string }[] = [
    { from: "PENDING", to: "IN_REVIEW", actor: admin, note: "admin cannot claim" },
    { from: "PENDING", to: "IN_REVIEW", actor: viewer, note: "viewer cannot claim" },
    { from: "PENDING", to: "IN_REVIEW", actor: noRoles, note: "no roles cannot claim" },
    { from: "IN_REVIEW", to: "APPROVED", actor: admin, note: "admin cannot approve" },
    { from: "IN_REVIEW", to: "APPROVED", actor: viewer, note: "viewer cannot approve" },
    { from: "IN_REVIEW", to: "REJECTED", actor: viewer, note: "viewer cannot reject" },
    { from: "IN_REVIEW", to: "ESCALATED", actor: admin, note: "admin cannot escalate" },
    { from: "ESCALATED", to: "IN_REVIEW", actor: reviewer, note: "reviewer cannot reopen" },
    { from: "ESCALATED", to: "IN_REVIEW", actor: admin, note: "admin cannot reopen" },
    { from: "ESCALATED", to: "IN_REVIEW", actor: multiRole, note: "reviewer-in-multi cannot reopen" },
  ];
  for (const d of DENIED) {
    it(`rejects ${d.from}→${d.to} as ${d.actor.roles.join("+") || "∅"} with 403 FORBIDDEN (${d.note})`, () => {
      expect(run(d.from, d.to, d.actor, d.actor.sub, "x".repeat(20))).toThrowError(
        expect.objectContaining({ code: "FORBIDDEN", statusCode: 403 }),
      );
    });
  }

  // Assignee guard: non-claim edges require actor == assignee.
  const ACT: [Status, Status][] = [
    ["IN_REVIEW", "APPROVED"],
    ["IN_REVIEW", "REJECTED"],
    ["IN_REVIEW", "ESCALATED"],
  ];
  for (const [f, t] of ACT) {
    it(`rejects ${f}→${t} for a non-assignee with 403 NOT_ASSIGNEE`, () => {
      expect(run(f, t, reviewer, OTHER, "x".repeat(20))).toThrowError(
        expect.objectContaining({ code: "NOT_ASSIGNEE", statusCode: 403 }),
      );
    });
    it(`rejects ${f}→${t} when assignee_id is null with 403 NOT_ASSIGNEE`, () => {
      expect(run(f, t, reviewer, null, "x".repeat(20))).toThrowError(
        expect.objectContaining({ code: "NOT_ASSIGNEE", statusCode: 403 }),
      );
    });
  }
  it("claim edges ignore the prior assignee (claim always re-assigns)", () => {
    expect(run("PENDING", "IN_REVIEW", reviewer, OTHER)()).toEqual({ assigns: true });
    expect(run("PENDING", "IN_REVIEW", reviewer, null)()).toEqual({ assigns: true });
    expect(run("ESCALATED", "IN_REVIEW", supervisor, OTHER)()).toEqual({ assigns: true });
  });

  // Reason boundary values — the 20-char rule, exercised at every edge.
  const REASON_BOUNDS: { len: number | null; ok: boolean; got?: number }[] = [
    { len: null, ok: false, got: 0 },
    { len: 0, ok: false, got: 0 },
    { len: 1, ok: false, got: 1 },
    { len: 19, ok: false, got: 19 },
    { len: 20, ok: true },
    { len: 21, ok: true },
    { len: 200, ok: true },
  ];
  for (const b of REASON_BOUNDS) {
    it(`reject reason ${b.len ?? "absent"} chars → ${b.ok ? "allowed" : "400 REASON_REQUIRED"}`, () => {
      const fn = run(
        "IN_REVIEW",
        "REJECTED",
        reviewer,
        reviewer.sub,
        b.len === null ? undefined : "x".repeat(b.len),
      );
      if (b.ok) {
        expect(fn()).toEqual({ assigns: false });
      } else {
        expect(fn).toThrowError(
          expect.objectContaining({
            code: "REASON_REQUIRED",
            statusCode: 400,
            detail: { min: 20, got: b.got },
          }),
        );
      }
    });
  }
  it("trims reason whitespace — 20 spaces still fails (trimmed length 0)", () => {
    expect(
      run("IN_REVIEW", "REJECTED", reviewer, reviewer.sub, " ".repeat(20)),
    ).toThrowError(
      expect.objectContaining({ code: "REASON_REQUIRED", detail: { min: 20, got: 0 } }),
    );
  });
  it("accepts a reason that trims to exactly 20 chars from padded input", () => {
    expect(
      run("IN_REVIEW", "REJECTED", reviewer, reviewer.sub, `  ${"x".repeat(20)}  `)(),
    ).toEqual({ assigns: false });
  });
  it("rejects a 19-char reason padded with spaces (trim first)", () => {
    expect(
      run("IN_REVIEW", "REJECTED", reviewer, reviewer.sub, ` ${"x".repeat(19)} `),
    ).toThrowError(expect.objectContaining({ code: "REASON_REQUIRED", detail: { min: 20, got: 19 } }));
  });
  it("ignores a stray reason on non-reject edges (approve does not need one)", () => {
    expect(run("IN_REVIEW", "APPROVED", reviewer, reviewer.sub, "n/a")()).toEqual({
      assigns: false,
    });
  });
  it("guard errors name the required role in the message", () => {
    expect(
      run("ESCALATED", "IN_REVIEW", reviewer, reviewer.sub),
    ).toThrowError(expect.objectContaining({ message: expect.stringContaining("supervisor") }));
  });
});
