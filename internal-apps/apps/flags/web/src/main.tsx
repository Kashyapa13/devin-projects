import { initI18n } from "@company/ui";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { resources } from "./strings.js";

initI18n({ resources });

// Motion test-mode: ?motion=off freezes every transition for FT determinism.
if (
  new URLSearchParams(location.search).get("motion") === "off" ||
  localStorage.getItem("motion") === "off"
) {
  document.documentElement.dataset["motion"] = "off";
}

createRoot(document.getElementById("root")!).render(<App />);
