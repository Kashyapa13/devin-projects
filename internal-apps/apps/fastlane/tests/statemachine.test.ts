import { describe, expect, it } from "vitest";
import {
  STATUSES,
  TRANSITIONS,
  canTransition,
  type Status,
} from "../api/src/statemachine.js";

const reviewer = { sub: "u-rev", roles: ["reviewer"] };
const supervisor = { sub: "u-sup", roles: ["supervisor"] };
const OTHER = "u-other";

function edge(
  from: Status,
  to: Status,
  actor = reviewer,
  assigneeId = actor.sub,
  reason?: string,
) {
  return () =>
    canTransition({ from, to, actor, assigneeId, reason });
}

describe("statemachine — the ONLY legal transitions (gate: §7.2)", () => {
  it("accepts exactly the five legal edges with their guards", () => {
    expect(edge("PENDING", "IN_REVIEW")()).toEqual({ assigns: true });
    expect(edge("IN_REVIEW", "APPROVED")()).toEqual({ assigns: false });
    expect(
      edge("IN_REVIEW", "REJECTED", reviewer, reviewer.sub, "missing documents on the file")(),
    ).toEqual({ assigns: false });
    expect(edge("IN_REVIEW", "ESCALATED")()).toEqual({ assigns: false });
    // supervisor reopen — the fifth edge
    expect(edge("ESCALATED", "IN_REVIEW", supervisor, supervisor.sub)()).toEqual({ assigns: true });
  });

  it("rejects every other pair (all 20 illegal edges)", () => {
    const legal = new Set(TRANSITIONS.map((t) => `${t.from}->${t.to}`));
    const illegal: [Status, Status][] = [];
    for (const f of STATUSES)
      for (const t of STATUSES)
        if (!legal.has(`${f}->${t}`)) illegal.push([f, t]);
    expect(illegal.length).toBe(20);
    for (const [f, t] of illegal) {
      expect(edge(f, t, supervisor, supervisor.sub)).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    }
  });

  it("enforces the assignee guard on act transitions", () => {
    expect(edge("IN_REVIEW", "APPROVED", reviewer, OTHER)).toThrowError(
      expect.objectContaining({ code: "NOT_ASSIGNEE" }),
    );
    expect(edge("IN_REVIEW", "ESCALATED", reviewer, OTHER)).toThrowError(
      expect.objectContaining({ code: "NOT_ASSIGNEE" }),
    );
  });

  it("enforces reason ≥20 on reject", () => {
    expect(edge("IN_REVIEW", "REJECTED", reviewer, reviewer.sub, "short")).toThrowError(
      expect.objectContaining({ code: "REASON_REQUIRED" }),
    );
    expect(edge("IN_REVIEW", "REJECTED", reviewer, reviewer.sub)).toThrowError(
      expect.objectContaining({ code: "REASON_REQUIRED" }),
    );
  });

  it("enforces roles: reviewer cannot reopen, viewer cannot act", () => {
    expect(edge("ESCALATED", "IN_REVIEW", reviewer, reviewer.sub)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(
      edge("PENDING", "IN_REVIEW", { sub: "u-v", roles: ["viewer"] }, "u-v"),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });
});
