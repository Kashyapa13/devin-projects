import type { Queryable } from "../../api/src/ask/executor.js";

export interface RecordedCall {
  text: string;
  params: readonly unknown[] | undefined;
}

interface StubRule {
  match: RegExp;
  result?: { rows: Record<string, unknown>[] };
  error?: Error & { code?: string };
}

/**
 * Recording Queryable stub — routes queries by first-match regex and
 * captures every call so tests can assert order (SET → EXPLAIN → run)
 * and bound params. No docker needed: pure-logic coverage lives here.
 */
export class StubDb implements Queryable {
  calls: RecordedCall[] = [];
  private rules: StubRule[] = [];

  constructor(rules: StubRule[] = []) {
    this.rules = rules;
  }

  when(match: RegExp, result: { rows: Record<string, unknown>[] }): this {
    this.rules.push({ match, result });
    return this;
  }
  failWhen(match: RegExp, error: Error & { code?: string }): this {
    this.rules.push({ match, error });
    return this;
  }

  async query(text: string, params?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ text, params });
    for (const r of this.rules) {
      if (r.match.test(text)) {
        if (r.error) throw r.error;
        return r.result!;
      }
    }
    return { rows: [] };
  }

  texts(): string[] {
    return this.calls.map((c) => c.text);
  }
}

/** EXPLAIN output a fenced run expects: a plan row under the cost cap. */
export const CHEAP_PLAN = {
  rows: [
    { "QUERY PLAN": "Limit  (cost=0.42..120.50 rows=10 width=64)" },
  ],
};
export const EXPENSIVE_PLAN = {
  rows: [
    { "QUERY PLAN": "Seq Scan on refund_events_raw  (cost=0.00..123456.78 rows=5000000 width=64)" },
  ],
};

/** A postgres statement_timeout error (canceling statement due to statement timeout). */
export function timeoutError(): Error & { code: string } {
  const e = new Error("canceling statement due to statement timeout") as Error & {
    code: string;
  };
  e.code = "57014";
  return e;
}
