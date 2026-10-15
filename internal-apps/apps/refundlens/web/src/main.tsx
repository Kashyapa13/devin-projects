import { initI18n, MotionProvider } from "@company/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { AskPage } from "./AskPage.js";
import { DashboardPage } from "./DashboardPage.js";
import { resources } from "./strings.js";

initI18n({ resources });

// #/dashboard is the default surface (ADR-0015 — the dashboard IS the app);
// #/ask keeps the ask box at its own hash.
function useRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      addEventListener("hashchange", cb);
      return () => removeEventListener("hashchange", cb);
    },
    () => location.hash || "#/dashboard",
  );
}

function App() {
  const hash = useRoute();
  return hash.startsWith("#/ask") ? <AskPage /> : <DashboardPage />;
}

const qc = new QueryClient();
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <QueryClientProvider client={qc}>
      <MotionProvider>
        <App />
      </MotionProvider>
    </QueryClientProvider>,
  );
}
