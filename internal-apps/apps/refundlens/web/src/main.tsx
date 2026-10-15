import { initI18n } from "@company/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AskPage } from "./AskPage.js";
import { resources } from "./strings.js";

initI18n({ resources });

const qc = new QueryClient();
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <QueryClientProvider client={qc}>
      <AskPage />
    </QueryClientProvider>,
  );
}
