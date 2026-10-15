import { describe, expect, it } from "vitest";
import { keyboardMode, type PageLike } from "../src/keyboard.js";
import { k6ScenarioBuilder } from "../src/k6.js";
import { pgHarness, type PgHarness } from "../src/pgHarness.js";
import {
  defineSeeds,
  runSeeds,
  type SeedDb,
} from "../src/seeds.js";

/**
 * Self-test against a dummy app — proves the harness works end-to-end
 * the way a real app would use it.
 */

class FakeDb implements SeedDb {
  calls: { text: string; params: readonly unknown[] }[] = [];
  async query(text: string, params: readonly unknown[] = []) {
    this.calls.push({ text, params });
  }
}

const dummySeeds = defineSeeds({
  "dummy-seed-v1": async ({ db, rng }) => {
    const n = 1 + Math.floor(rng() * 100);
    await db.query("INSERT INTO items (label, n) VALUES ($1, $2)", [
      `item-${n}`,
      n,
    ]);
  },
});

describe("seederFramework", () => {
  it("runs named seeds", async () => {
    const db = new FakeDb();
    await runSeeds(db, dummySeeds, "dummy-seed-v1");
    expect(db.calls).toHaveLength(1);
    expect(dummySeeds.names()).toEqual(["dummy-seed-v1"]);
  });

  it("is deterministic — same seed value, same fixture", async () => {
    const a = new FakeDb();
    const b = new FakeDb();
    await runSeeds(a, dummySeeds, "dummy-seed-v1", 7);
    await runSeeds(b, dummySeeds, "dummy-seed-v1", 7);
    expect(a.calls).toEqual(b.calls);
  });

  it("rejects unregistered seeds by name", async () => {
    await expect(
      runSeeds(new FakeDb(), dummySeeds, "nope"),
    ).rejects.toThrow(/not registered/);
  });
});

describe("k6ScenarioBuilder", () => {
  it("emits a runnable-shaped k6 script", () => {
    const src = k6ScenarioBuilder({
      name: "queue",
      baseUrl: "http://localhost:3000",
      vus: 10,
      duration: "30s",
      requests: [
        { method: "GET", path: "/cases" },
        { method: "POST", path: "/cases/c-1/claim", body: { user: "k6" } },
      ],
      thresholds: { http_req_duration: ["p(95)<1000"] },
    });
    expect(src).toContain('vus: 10');
    expect(src).toContain('duration: "30s"');
    expect(src).toContain("http.get(`${BASE_URL}/cases`)");
    expect(src).toContain("http.post(`${BASE_URL}/cases/c-1/claim`");
    expect(src).toContain("p(95)<1000");
  });
});

describe("keyboardMode", () => {
  function fakePage(log: string[]): PageLike {
    return {
      keyboard: {
        async press(key) {
          log.push(key);
        },
      },
    };
  }

  it("presses key sequences in order", async () => {
    const log: string[] = [];
    await keyboardMode(fakePage(log)).pressSeq(["j", "j", "c"]);
    expect(log).toEqual(["j", "j", "c"]);
  });

  it("asserts focus order and reports mismatches", async () => {
    const log: string[] = [];
    const km = keyboardMode(fakePage(log));
    const focuses = ["search", "row-1", "claim-btn"];
    let i = 0;
    const getFocused = async () => focuses[i++];
    await km.expectFocusOrder(getFocused, focuses);
    expect(log).toEqual(["Tab", "Tab", "Tab"]);

    await expect(
      km.expectFocusOrder(async () => "wrong", ["search"]),
    ).rejects.toThrow(/focus order mismatch/);
  });
});

describe("pgHarness (docker)", () => {
  it("boots a per-app Postgres and accepts seeds", async (ctx) => {
    let harness: PgHarness;
    try {
      harness = await pgHarness("dummyapp");
    } catch {
      ctx.skip();
      return;
    }
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: harness.dsn });
      await pool.query(
        "CREATE TABLE items (id SERIAL PRIMARY KEY, label TEXT, n INT)",
      );
      await runSeeds(pool, dummySeeds, "dummy-seed-v1");
      const res = await pool.query("SELECT COUNT(*)::int AS n FROM items");
      expect(res.rows[0].n).toBe(1);
      const db = await pool.query("SELECT current_database() AS db");
      expect(db.rows[0].db).toBe("dummyapp"); // per-app DB
      await pool.end();
    } finally {
      await harness.stop();
    }
  });
});
