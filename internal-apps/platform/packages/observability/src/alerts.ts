import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const Alert = Type.Object({
  name: Type.String({ pattern: "^[a-z][a-z0-9_]*$" }),
  /** PromQL-ish expression */
  expr: Type.String({ minLength: 1 }),
  for: Type.Optional(Type.String({ pattern: "^[0-9]+(s|m|h)$" })),
  severity: Type.Union([
    Type.Literal("page"),
    Type.Literal("ticket"),
    Type.Literal("info"),
  ]),
  summary: Type.String({ minLength: 1 }),
  /** required for page severity — on-call must know where to look */
  runbook: Type.Optional(Type.String()),
});
export type Alert = Static<typeof Alert>;

export const AlertManifest = Type.Object({
  service: Type.String({ minLength: 1 }),
  alerts: Type.Array(Alert),
});
export type AlertManifest = Static<typeof AlertManifest>;

const checkAlert = TypeCompiler.Compile(Alert);
const checkManifest = TypeCompiler.Compile(AlertManifest);

/**
 * Build a validated alert manifest for a service. Throws on schema
 * violation or on a `page` alert with no runbook — paging without a
 * runbook is a program defect.
 */
export function alertManifest(
  service: string,
  alerts: Alert[],
): AlertManifest {
  for (const alert of alerts) {
    const label = (alert as { name?: string }).name ?? "?";
    if (!checkAlert.Check(alert)) {
      throw new Error(
        `alertManifest: bad alert "${label}" — ${checkAlert.Errors(alert).First()?.message}`,
      );
    }
    if (alert.severity === "page" && !alert.runbook) {
      throw new Error(
        `alertManifest: page alert "${alert.name}" requires runbook`,
      );
    }
  }
  const manifest = { service, alerts };
  if (!checkManifest.Check(manifest)) {
    throw new Error("alertManifest: schema violation");
  }
  return manifest;
}
