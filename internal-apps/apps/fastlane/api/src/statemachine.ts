import { ApiError } from "@company/http";

/**
 * The ONLY legal transitions (AGENTS.md §4 — table-driven, pure: no I/O).
 * Adding/removing an edge = ADR + LLD update + full matrix re-test.
 * Mirrors the state_transitions seed rows — drift is caught by the
 * contract test, not by code reading this table.
 */
export const STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "ESCALATED",
] as const;
export type Status = (typeof STATUSES)[number];

interface Edge {
  from: Status;
  to: Status;
  roles: string[];
  /** becomes the case assignee on success (a claim) */
  assigns: boolean;
  needsReason?: boolean;
}

export const TRANSITIONS: readonly Edge[] = [
  { from: "PENDING", to: "IN_REVIEW", roles: ["reviewer", "supervisor"], assigns: true },
  { from: "IN_REVIEW", to: "APPROVED", roles: ["reviewer", "supervisor"], assigns: false },
  { from: "IN_REVIEW", to: "REJECTED", roles: ["reviewer", "supervisor"], assigns: false, needsReason: true },
  { from: "IN_REVIEW", to: "ESCALATED", roles: ["reviewer", "supervisor"], assigns: false },
  { from: "ESCALATED", to: "IN_REVIEW", roles: ["supervisor"], assigns: true }, // supervisor reopen
];

export interface ActorCtx {
  sub: string;
  roles: string[];
}
export interface GuardInput {
  from: Status;
  to: Status;
  actor: ActorCtx;
  assigneeId: string | null;
  reason?: string | undefined;
}
export interface Verdict {
  assigns: boolean;
}

const REASON_MIN = 20;

/** Pure guard: throws the envelope-coded ApiError for every illegal edge. */
export function canTransition(g: GuardInput): Verdict {
  const edge = TRANSITIONS.find((e) => e.from === g.from && e.to === g.to);
  if (!edge) {
    throw new ApiError(
      "INVALID_TRANSITION",
      `cannot move a case from ${g.from} to ${g.to} — ask for the case to be moved by an allowed step`,
      400,
    );
  }
  if (!g.actor.roles.some((r) => edge.roles.includes(r))) {
    throw new ApiError(
      "FORBIDDEN",
      `the ${g.to} action needs a ${edge.roles.join(" or ")} role`,
      403,
    );
  }
  if (edge.assigns) {
    return { assigns: true }; // claim: actor becomes assignee
  }
  if (g.assigneeId !== g.actor.sub) {
    throw new ApiError(
      "NOT_ASSIGNEE",
      "only the assignee can act on this case — claim it first or ask the assignee",
      403,
    );
  }
  if (edge.needsReason) {
    const len = (g.reason ?? "").trim().length;
    if (len < REASON_MIN) {
      throw new ApiError(
        "REASON_REQUIRED",
        `rejection needs a reason of at least ${REASON_MIN} characters — say what the reviewer should check next`,
        400,
        { min: REASON_MIN, got: len },
      );
    }
  }
  return { assigns: false };
}
