import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../web/src/App.js";

describe("the one page (@company/ui + i18n)", () => {
  it("renders the queue table with externalized strings, no raw keys", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Template App");
    expect(html).toContain("Work queue");
    expect(html).toContain("<table");
    expect(html).toContain("<caption>");
    expect(html).not.toContain("app.title"); // no raw i18n keys leak
  });
});
