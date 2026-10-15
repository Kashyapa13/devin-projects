import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initI18n, MotionProvider } from "@company/ui";
import { DashboardPage } from "../web/src/DashboardPage.js";
import { resources } from "../web/src/strings.js";

initI18n({ resources });

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, enabled: false } },
});

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MotionProvider>
        <DashboardPage />
      </MotionProvider>
    </QueryClientProvider>,
  );
}

describe("the dashboard page (F-09..F-16 — @company/ui + i18n)", () => {
  it("renders the global bar, widget surfaces, and externalized strings", () => {
    const html = render();
    // global bar — presets + compare + watermark chip
    expect(html).toContain("24h");
    expect(html).toContain("12M");
    expect(html).toContain("compare");
    expect(html).toContain("data as of");
    expect(html).toContain("watermark-chip");
    // the eight KPI cards (empty state — queries pending in SSR)
    expect((html.match(/data-testid="kpi-card"/g) ?? []).length).toBe(8);
    // every widget surface mounts (data-testid contract)
    for (const id of [
      "w-timeseries", "w-rate", "w-heatmap", "w-donut",
      "w-topn", "w-scatter", "w-monitors", "w-detail",
    ]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    // sortable top-bars controls + export + filters row
    expect(html).toContain("export csv");
    expect(html).toContain("global-filters");
    // i18n gate: no raw keys leak
    expect(html).not.toContain("dash.w.");
    expect(html).not.toContain("dash.kpi.");
  });
});
