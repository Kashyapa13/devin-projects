export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    detail?: unknown;
    req_id: string;
  };
}

/** Application error carrying a registry code and HTTP status. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Code → HTTP status registry. Unknown codes map to 400. Extend at app
 * boot with domain codes; the envelope code string is a stable API
 * contract (docs contract — changes ride with doc updates).
 */
export const errorCodeRegistry = new Map<string, number>([
  ["VALIDATION", 400],
  ["UNAUTHORIZED", 401],
  ["FORBIDDEN", 403],
  ["NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["RATE_LIMITED", 429],
  ["INTERNAL", 500],
]);

export function registerErrorCode(code: string, status: number): void {
  errorCodeRegistry.set(code, status);
}

export function statusFor(code: string): number {
  return errorCodeRegistry.get(code) ?? 400;
}

export function envelope(
  code: string,
  message: string,
  reqId: string,
  detail?: unknown,
): ErrorEnvelope {
  const body: ErrorEnvelope["error"] = { code, message, req_id: reqId };
  if (detail !== undefined) body.detail = detail;
  return { error: body };
}
