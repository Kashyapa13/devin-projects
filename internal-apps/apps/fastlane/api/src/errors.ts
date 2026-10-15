import { registerErrorCode } from "@company/http";

// FastLane's domain codes — registered once at boot; envelope code
// strings are a stable API contract (LLD API section).
registerErrorCode("INVALID_TRANSITION", 400);
registerErrorCode("REASON_REQUIRED", 400);
registerErrorCode("NOT_ASSIGNEE", 403);
registerErrorCode("STALE_VERSION", 409);
registerErrorCode("IDEMPOTENCY_REQUIRED", 400);
