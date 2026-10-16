import { fireEvent, render, screen } from "@testing-library/react";
import { run } from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { AppHeader, CommandDock, Segmented } from "../src/chrome.js";
import { initI18n } from "../src/i18n.js";
import { QueueTable } from "../src/QueueTable.js";
import { useKeyboardNav } from "../src/useKeyboardNav.js";

interface Row {
  id: number;
  title: string;
  status: string;
}

const rows: Row[] = [
  { id: 1, title: "case-1", status: "open" },
  { id: 2, title: "case-2", status: "claimed" },
];

function Table() {
  return (
    <QueueTable
      caption="Support queue"
      columns={[
        { key: "title", header: "Case", render: (r) => r.title },
        { key: "status", header: "Status", render: (r) => r.status },
      ]}
      rows={rows}
      actions={[{ label: "Claim", onSelect: () => {} }]}
    />
  );
}

describe("QueueTable", () => {
  it("has no axe violations", async () => {
    const { container } = render(<Table />);
    const results = await run(container, {
      rules: { region: { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("renders semantic table structure", () => {
    render(<Table />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Support queue")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Case" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Claim" })).toHaveLength(2);
  });
});

function Nav(props: {
  handlers: Parameters<typeof useKeyboardNav>[0];
  keyMap?: Parameters<typeof useKeyboardNav>[1];
}) {
  useKeyboardNav(props.handlers, props.keyMap);
  return (
    <div>
      <input aria-label="note" />
      <span>nav-target</span>
    </div>
  );
}

describe("useKeyboardNav", () => {
  it("fires j/k/c/a/r actions with default bindings", () => {
    const handlers = {
      next: vi.fn(),
      prev: vi.fn(),
      claim: vi.fn(),
      assign: vi.fn(),
      refresh: vi.fn(),
    };
    render(<Nav handlers={handlers} />);
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "k" });
    fireEvent.keyDown(document, { key: "c" });
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "r" });
    expect(handlers.next).toHaveBeenCalledOnce();
    expect(handlers.prev).toHaveBeenCalledOnce();
    expect(handlers.claim).toHaveBeenCalledOnce();
    expect(handlers.assign).toHaveBeenCalledOnce();
    expect(handlers.refresh).toHaveBeenCalledOnce();
  });

  it("remaps keys via keyMap", () => {
    const handlers = { next: vi.fn() };
    render(<Nav handlers={handlers} keyMap={{ n: "next" }} />);
    fireEvent.keyDown(document, { key: "n" });
    expect(handlers.next).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: "j" });
    expect(handlers.next).toHaveBeenCalledOnce(); // j no longer bound
  });

  it("ignores keys typed into inputs", () => {
    const handlers = { next: vi.fn() };
    render(<Nav handlers={handlers} />);
    const input = screen.getByLabelText("note");
    fireEvent.keyDown(input, { key: "j" });
    expect(handlers.next).not.toHaveBeenCalled();
  });
});

describe("fleet chrome (ADR-0018)", () => {
  it("AppHeader renders eyebrow + title + action slot, axe-clean", async () => {
    const { container } = render(
      <AppHeader eyebrow="KYC" title="FastLane">
        <CommandDock items={[{ keys: "J/K", label: "navigate" }]} />
      </AppHeader>,
    );
    expect(screen.getByRole("heading", { name: "FastLane" })).toBeTruthy();
    expect(screen.getByText("KYC")).toBeTruthy();
    const results = await run(container, {
      rules: { region: { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("CommandDock lists every shortcut with a key cap", () => {
    render(
      <CommandDock
        items={[
          { keys: "J/K", label: "navigate" },
          { keys: "C", label: "claim" },
        ]}
      />,
    );
    expect(screen.getByText("J/K")).toBeTruthy();
    expect(screen.getByText("navigate")).toBeTruthy();
    expect(screen.getByText("claim")).toBeTruthy();
  });

  it("Segmented exposes aria-pressed and fires onChange", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="queue tabs"
        value="team"
        onChange={onChange}
        options={[
          { value: "mine", label: "Mine" },
          { value: "team", label: "Team" },
        ]}
      />,
    );
    const team = screen.getByRole("button", { name: "Team" });
    expect(team.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(onChange).toHaveBeenCalledWith("mine");
  });
});

describe("initI18n", () => {
  it("translates externalized strings", () => {
    const i18n = initI18n({
      resources: { en: { translation: { "queue.title": "Queue" } } },
    });
    expect(i18n.t("queue.title")).toBe("Queue");
  });

  it("missing keys trip the gate (warn + return key)", () => {
    const onMissingKey = vi.fn();
    const i18n = initI18n({ resources: { en: { translation: {} } }, onMissingKey });
    expect(i18n.t("not.externalized")).toBe("not.externalized");
    expect(onMissingKey).toHaveBeenCalledWith("not.externalized");
  });
});
