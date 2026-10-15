import { initI18n, LayoutGroup, MotionProvider } from "@company/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { QueuePage } from "./QueuePage.js";
import { CasePage } from "./CasePage.js";
import { resources } from "./strings.js";

initI18n({ resources });

/** Minimal hash router: #/ queue · #/case/<id>[?reject=1] decision panel. */
function route(): { page: "queue" } | { page: "case"; id: string; reject: boolean } {
  const m = /^#\/case\/([0-9a-f-]+)(\?reject=1)?/.exec(location.hash);
  if (m?.[1]) return { page: "case", id: m[1], reject: m[2] !== undefined };
  return { page: "queue" };
}

function App() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const on = () => setR(route());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r.page === "queue" ? (
    <QueuePage />
  ) : (
    <CasePage id={r.id} autoReject={r.reject} />
  );
}

const qc = new QueryClient();
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <QueryClientProvider client={qc}>
      <MotionProvider>
        <LayoutGroup>
          <App />
        </LayoutGroup>
      </MotionProvider>
    </QueryClientProvider>,
  );
}
