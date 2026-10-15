import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { initI18n } from "@company/ui";
import { AskPage } from "../web/src/AskPage.js";
import { resources } from "../web/src/strings.js";

initI18n({ resources });

describe("the ask page (@company/ui + i18n)", () => {
  it("renders the ask bar + hints with externalized strings, no raw keys", () => {
    const html = renderToStaticMarkup(<AskPage />);
    expect(html).toContain("RefundLens");
    expect(html).toContain("Ask");
    expect(html).toContain("Enter ask"); // keys hint
    expect(html).not.toContain("app.title"); // no raw i18n keys leak
    expect(html).not.toContain("ask.placeholder\"");
  });
});
