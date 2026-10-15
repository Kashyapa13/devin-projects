import { describe, expect, it } from "vitest";
import {
  audited,
  auditWriter,
  toSiemLines,
  type Queryable,
} from "../src/audit.js";

/**
 * Transaction-faithful fake: statements buffer until COMMIT; an error or
 * explicit ROLLBACK discards them — mirroring Postgres semantics so the
 * kill-test proves atomicity, not mocks.
 */
class FakeTx implements Queryable {
  committed: { text: string; params: readonly unknown[] }[] = [];
  private pending: { text: string; params: readonly unknown[] }[] = [];
  private rolledBack = false;

  async query(text: string, params: readonly unknown[] = []) {
    if (this.rolledBack) throw new Error("tx aborted");
    const op = text.trim().split(/\s+/)[0]!.toUpperCase();
    if (op === "COMMIT") {
      this.committed.push(...this.pending);
      this.pending = [];
      return;
    }
    if (op === "ROLLBACK") {
      this.rolledBack = true;
      this.pending = [];
      return;
    }
    this.pending.push({ text, params });
  }

  /** Simulate a crash: everything buffered so far is lost. */
  crash() {
    this.rolledBack = true;
    this.pending = [];
  }
}

describe("auditWriter", () => {
  it("writes a single INSERT on the caller's tx handle", async () => {
    const tx = new FakeTx();
    await auditWriter(tx, {
      actor: "op-1",
      action: "claim",
      entity: "case",
      entityId: "c-42",
      reqId: "req-7",
    });
    await tx.query("COMMIT");
    expect(tx.committed).toHaveLength(1);
    expect(tx.committed[0]!.text).toMatch(/^INSERT INTO audit_events/);
    expect(tx.committed[0]!.params[1]).toBe("claim");
  });
});

describe("audited — atomicity", () => {
  it("commits state change + audit row as one unit", async () => {
    const tx = new FakeTx();
    await audited(
      tx,
      async (t) => {
        await t.query("UPDATE cases SET status=$1 WHERE id=$2", [
          "claimed",
          "c-1",
        ]);
        return "c-1";
      },
      (id) => ({
        actor: "op-1",
        action: "claim",
        entity: "case",
        entityId: id,
      }),
    );
    await tx.query("COMMIT");
    expect(tx.committed).toHaveLength(2); // UPDATE + INSERT, one commit
  });

  it("kill-test: crash mid-action leaves no orphan state and no audit row", async () => {
    const tx = new FakeTx();
    await expect(
      audited(
        tx,
        async (t) => {
          await t.query("UPDATE cases SET status=$1 WHERE id=$2", [
            "claimed",
            "c-9",
          ]);
          tx.crash(); // process dies between state write and audit write
          return "c-9";
        },
        (id) => ({
          actor: "op-1",
          action: "claim",
          entity: "case",
          entityId: id,
        }),
      ),
    ).rejects.toThrow(/tx aborted/);
    expect(tx.committed).toHaveLength(0); // no orphan state, no audit
  });

  it("a failed audit write also undoes the state change", async () => {
    const tx = new FakeTx();
    await expect(
      audited(
        tx,
        async (t) => {
          await t.query("UPDATE cases SET status=$1 WHERE id=$2", [
            "claimed",
            "c-2",
          ]);
          return "c-2";
        },
        () => {
          tx.crash(); // dies between state change and audit write
          return {
            actor: "op-1",
            action: "claim",
            entity: "case",
            entityId: "c-2",
          };
        },
      ),
    ).rejects.toThrow(/tx aborted/);
    expect(tx.committed).toHaveLength(0);
  });
});

describe("append-only", () => {
  it("the module only ever emits INSERT — no UPDATE/DELETE surface exists", async () => {
    const tx = new FakeTx();
    await auditWriter(tx, {
      actor: "a",
      action: "x",
      entity: "e",
      entityId: "1",
    });
    await audited(
      tx,
      async () => "id",
      () => ({ actor: "a", action: "y", entity: "e", entityId: "id" }),
    );
    await tx.query("COMMIT");
    for (const stmt of tx.committed) {
      expect(stmt.text.trim()).toMatch(/^INSERT INTO audit_events/);
    }
  });
});

describe("SIEM export", () => {
  it("serializes one JSON object per line", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const out = toSiemLines([
      {
        id: 1,
        actor: "op",
        action: "claim",
        entity: "case",
        entityId: "c-1",
        reqId: "r-1",
        at,
      },
      { id: 2, actor: "op", action: "release", entity: "case", entityId: "c-1", at },
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({
      actor: "op",
      action: "claim",
      entity_id: "c-1",
      req_id: "r-1",
      at: "2026-01-01T00:00:00.000Z",
    });
  });
});
