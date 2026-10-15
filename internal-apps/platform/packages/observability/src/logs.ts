import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

/** Structured JSON log line. req_id threads X-Request-ID correlation. */
export const LogLine = Type.Object({
  ts: Type.String(),
  level: Type.Union([
    Type.Literal("debug"),
    Type.Literal("info"),
    Type.Literal("warn"),
    Type.Literal("error"),
  ]),
  service: Type.String({ minLength: 1 }),
  msg: Type.String(),
  req_id: Type.Optional(Type.String()),
  err: Type.Optional(Type.String()),
  extra: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type LogLine = Static<typeof LogLine>;

const check = TypeCompiler.Compile(LogLine);

export type LogSink = (line: string) => void;

const stdout: LogSink = (line) => process.stdout.write(line + "\n");

/**
 * Emit one schema-validated JSON log line. Throws on schema violation —
 * a malformed line is a bug, never shipped to the log drain.
 * Never log C3/C4 payloads (constitution — forbidden globally).
 */
export function log(entry: LogLine, sink: LogSink = stdout): void {
  if (!check.Check(entry)) {
    throw new Error(`log: schema violation — ${check.Errors(entry).First()?.message}`);
  }
  sink(JSON.stringify(entry));
}

/** Validate a candidate object against the log schema (for tests/DLP). */
export function isLogLine(value: unknown): value is LogLine {
  return check.Check(value);
}
