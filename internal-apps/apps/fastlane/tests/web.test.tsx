import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { initI18n, QueueTable } from "@company/ui";
import { StatusPill, SlaChip } from "../web/src/components.js";
import { resources } from "../web/src/strings.js";

initI18n({ resources });

interface Row {
  id: string;
  ref: string;
  status: string;
}

const rows: Row[] = [
  { id: "1", ref: "CUST-0001", status: "PENDING" },
  { id: "2", ref: "CUST-0002", status: "IN_REVIEW" },
];

/**
 * FT coverage for the screens the interaction-system retrofit touched
 * (UX-GAP.md inventory): the queue table's gesture/morph surface and
 * the status/SLA primitives. Gesture physics are covered by
 * platform-ui's motion tests; these pin the app-side wiring.
 */
describe("queue table — gestures + morph wiring (ADR-0014)", () => {
  const table = (
    <QueueTable<Row>
      caption="KYC review queue"
      columns={[
        { key: "ref", header: "Ref", render: (r) => r.ref },
        { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
      ]}
      rows={rows}
      morphIdPrefix="case"
      morphKey="ref"
      gestures={{
        onSwipeRight: () => {},
        onReassign: () => {},
        reassignHint: "drop here to claim",
      }}
    />
  );
  const html = renderToStaticMarkup(table);

  it("renders the drop-strip for drag-to-claim", () => {
    expect(html).toContain('data-testid="reassign-drop"');
    expect(html).toContain("drop here to claim");
  });

  it("renders rows with stable ids for keyboard + morph targets", () => {
    expect(html).toContain('data-row-id="1"');
    expect(html).toContain('data-row-id="2"');
    expect(html).toContain("CUST-0001");
  });

  it("keeps the semantic table contract (caption + scope)", () => {
    expect(html).toContain("KYC review queue");
    expect(html).toContain('scope="col"');
  });
});

describe("status pill + SLA chip (motion primitives)", () => {
  it("renders every legal status with its color-spring pill", () => {
    for (const s of ["pending", "in_review", "approved", "rejected", "escalated"]) {
      const html = renderToStaticMarkup(<StatusPill status={s} />);
      expect(html).toContain("pill");
      expect(html).toContain(`pill-${s}`);
    }
  });

  it("SLA chip renders a due label, no raw keys", () => {
    const html = renderToStaticMarkup(
      <SlaChip dueAt={new Date(Date.now() - 3600_000).toISOString()} />,
    );
    expect(html).toContain("chip");
    expect(html).not.toContain("sla.");
  });
});
