import {
  renderAggQuery,
  renderRawQuery,
  type Dim,
  type FilterField,
  type Metric,
  type RenderedQuery,
  type ViewParams,
} from "./templates.js";

/**
 * Deterministic NL→SQL (AGENTS.md §1 — no model in the request path).
 * The question is mapped onto the SAME typed params the view console
 * sends; the generator never composes SQL text itself — templates do.
 * Hostile questions deliberately route to the fence, not around it.
 */

export interface Generated {
  query: RenderedQuery;
  /** what we understood — surfaced in the answer card */
  understood: string;
}

export class Unparseable extends Error {}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const DIM_WORDS: [RegExp, Dim][] = [
  [/\b(per|by|each|daily|over time|trend)\s+(day|date|days)\b|\bdaily\b|\bover time\b|\btrend\b/, "day"],
  [/\b(per|by|each)\s+(channel|rail|rails)\b|\bchannels?\b/, "channel"],
  [/\b(per|by|each)\s+(merchant|segment|merchants|segments)\b|\bsegments?\b/, "merchant_segment"],
  [/\b(per|by|each)\s+(reason|reasons)\b|\breasons?\b/, "reason_code"],
];

const METRIC_WORDS: [RegExp, Metric][] = [
  [/\bp95\b|\bslow|\blatency\b|\blatent\b/, "p95_ms"],
  [/\bamount|total|value|volume|dollar|money|sum\b/, "amount"],
  [/\bcount|how many|number of|volume of|many\b/, "count"],
];

const FIELD_WORDS: [RegExp, FilterField][] = [
  [/\bchannel\b/, "channel"],
  [/\bsegment\b/, "merchant_segment"],
  [/\breason\b/, "reason_code"],
  [/\bstate\b/, "state"],
];

const MUTATION_WORDS =
  /\b(delete|drop|update|insert|truncate|alter|create table|wipe|remove all|modify)\b/;
const BANNED_TABLE_WORDS = /\b(ask[_ ]?log|sync[_ ]?runs?|audit|logs? of|what did .* ask)\b/;

function windowOf(q: string, now: Date): { from: string; to: string } {
  const days = /last\s+(\d+)\s+days?/.exec(q);
  const weeks = /last\s+(\d+)\s+weeks?/.exec(q);
  const months = /last\s+(\d+)\s+months?/.exec(q);
  let back = 30;
  if (days) back = Number(days[1]);
  else if (weeks) back = Number(weeks[1]) * 7;
  else if (months) back = Number(months[1]) * 30;
  const to = new Date(now.getTime() - DAY_MS); // data lands daily; yesterday is the fresh edge
  const from = new Date(to.getTime() - back * DAY_MS);
  return { from: iso(from), to: iso(to) };
}

function filtersOf(q: string): ViewParams["filters"] {
  const out: NonNullable<ViewParams["filters"]> = [];
  for (const [re, field] of FIELD_WORDS) {
    const m = new RegExp(`${re.source.slice(1, -1)}\\s*[=:]\\s*([\\w-]+)`).exec(q);
    if (m?.[1]) out.push({ field, op: "eq", value: m[1].toUpperCase() });
  }
  return out;
}

/**
 * Map a question to a fenced query. Anything asking for a write or a
 * banned surface emits SQL the fence MUST reject — we do not pre-judge
 * intent here; the fence is the only gate (LLD §fence).
 */
export function generate(question: string, now = new Date()): Generated {
  const q = question.toLowerCase().trim();
  if (!q) throw new Unparseable("empty question");

  // hostile intents → emit the banned thing so the fence answers
  if (MUTATION_WORDS.test(q)) {
    return {
      understood: "a write request",
      query: {
        sql: "DELETE FROM refundlens.agg_daily WHERE false",
        params: [],
        frame: { metric: "—", dim: "—", from: "", to: "" },
      },
    };
  }
  if (BANNED_TABLE_WORDS.test(q)) {
    const table = /sync/.test(q) ? "sync_runs" : "ask_log";
    return {
      understood: "a request for internal telemetry",
      query: {
        sql: `SELECT * FROM refundlens.${table} LIMIT 100`,
        params: [],
        frame: { metric: "—", dim: "—", from: "", to: "" },
      },
    };
  }
  if (/\b(users|passwords|secrets|tokens|customers|cards|pan)\b/.test(q)) {
    return {
      understood: "a request outside the refund schema",
      query: {
        sql: "SELECT * FROM public.users LIMIT 100",
        params: [],
        frame: { metric: "—", dim: "—", from: "", to: "" },
      },
    };
  }

  const { from, to } = windowOf(q, now);
  const filters = filtersOf(q) ?? [];

  const wantsRows =
    /\b(show|list|see|raw|events?|rows?|latest|recent)\b/.test(q) &&
    !/\b(how many|count|number of|total|by|per)\b/.test(q);
  if (wantsRows) {
    return {
      understood: "recent refund events",
      query: renderRawQuery({
        from,
        to,
        limit: 100,
        filters,
      }),
    };
  }

  const dim = DIM_WORDS.find(([re]) => re.test(q))?.[1] ?? "day";
  const metric = METRIC_WORDS.find(([re]) => re.test(q))?.[1] ?? "count";
  const query = renderAggQuery({
    dim,
    metric,
    from,
    to,
    filters,
  });
  return {
    understood: `${query.frame.metric} by ${query.frame.dim}, ${from} → ${to}`,
    query,
  };
}
