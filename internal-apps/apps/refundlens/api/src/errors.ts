import { registerErrorCode } from "@company/http";

// RefundLens domain codes — the envelope `code` strings are a stable API
// contract (LLD API registry + AGENTS.md §3 rejection contract).
registerErrorCode("FENCED_QUERY_REJECTED", 400);
registerErrorCode("QUESTION_UNPARSEABLE", 400);
