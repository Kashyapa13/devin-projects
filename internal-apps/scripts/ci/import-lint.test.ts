import { describe, expect, it } from "vitest";
import { checkFile } from "./import-lint.ts";

const APPS = new Set(["fastlane", "refundlens", "flags", "_template"]);
const ROOT_PREFIX = process.cwd();

function check(path: string, content: string) {
  return checkFile(`${ROOT_PREFIX}/${path}`, content, APPS);
}

describe("import-lint", () => {
  it("flags platform → apps (relative and bare)", () => {
    const v = check(
      "platform/packages/http/src/x.ts",
      `import { seed } from "../../../../apps/fastlane/scripts/seed.js";`,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe("platform->apps");

    const bare = check(
      "platform/packages/db/src/y.ts",
      `import { fork } from "apps/refundlens/scripts/fork_report.js";`,
    );
    expect(bare[0]!.rule).toBe("platform->apps");

    const byName = check(
      "platform/packages/audit/src/z.ts",
      `import { x } from "refundlens/etl/job.js";`,
    );
    expect(byName[0]!.rule).toBe("platform->apps");
  });

  it("flags apps/<a> → apps/<b>", () => {
    const v = check(
      "apps/fastlane/api/routes/r.ts",
      `import { fork } from "../../../refundlens/scripts/fork_report.js";`,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe("app->app");
  });

  it("allows legal imports", () => {
    expect(
      check(
        "platform/packages/http/src/a.ts",
        `import { log } from "@company/observability";
         import { x } from "../../audit/src/audit.js";`,
      ),
    ).toHaveLength(0);
    expect(
      check(
        "apps/fastlane/api/routes/a.ts",
        `import { httpPlugin } from "@company/http";
         import { cases } from "../services/cases.js";`,
      ),
    ).toHaveLength(0);
  });
});
