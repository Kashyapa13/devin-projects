import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { envVarRegistry } from "../src/envVarRegistry.js";
import {
  BLUEGREEN_TEMPLATE,
  DOCKERFILE_BASE,
  MIGRATION_JOB_TEMPLATE,
} from "../src/index.js";

describe("Dockerfile.base", () => {
  const dockerfile = readFileSync(DOCKERFILE_BASE, "utf8");

  it("is multi-stage, non-root, with a healthcheck", () => {
    expect(dockerfile.match(/^FROM /gm)!.length).toBeGreaterThanOrEqual(2);
    expect(dockerfile).toMatch(/^USER app$/m);
    expect(dockerfile).toContain("runAsNonRoot".length ? "USER app" : "");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/healthz");
  });
});

describe("deploy templates", () => {
  it("blue/green template wires readiness/liveness probes", () => {
    const tpl = readFileSync(BLUEGREEN_TEMPLATE, "utf8");
    expect(tpl).toContain("track: green");
    expect(tpl).toContain("/readyz");
    expect(tpl).toContain("runAsNonRoot");
  });

  it("migration job never auto-retries and runs as non-root", () => {
    const tpl = readFileSync(MIGRATION_JOB_TEMPLATE, "utf8");
    expect(tpl).toContain("backoffLimit: 0");
    expect(tpl).toContain("runAsNonRoot");
    expect(tpl).toContain("migrate.js");
  });
});

describe("envVarRegistry", () => {
  it("registers names + vault refs", () => {
    const reg = envVarRegistry([
      {
        name: "DATABASE_URL",
        vaultRef: "vault:prod/fastlane",
        envs: ["prod"],
      },
    ]);
    expect(reg.get("DATABASE_URL")!.vaultRef).toBe("vault:prod/fastlane");
  });

  it("rejects non-vault refs — values are forbidden by design", () => {
    expect(() =>
      envVarRegistry([
        {
          name: "DATABASE_URL",
          vaultRef: "postgres://user:pass@host/db",
          envs: ["prod"],
        },
      ]),
    ).toThrow(/values are forbidden/);
  });

  it("rejects bad names and duplicates", () => {
    expect(() =>
      envVarRegistry([
        { name: "database_url", vaultRef: "vault:prod/app", envs: ["prod"] },
      ]),
    ).toThrow(/bad name/);
    const dup = {
      name: "X",
      vaultRef: "vault:prod/app",
      envs: ["prod" as const],
    };
    expect(() => envVarRegistry([dup, dup])).toThrow(/duplicate/);
  });
});
