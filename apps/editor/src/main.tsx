import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Unsupported } from "./components/Unsupported.tsx";
import { engine } from "./lib/engine.ts";
import { browserEnv, checkSupport, limitsMessage } from "./lib/support.ts";
import { flushSave, startAutosave } from "./state/autosave.ts";
import { getHandle } from "./state/media.ts";
import { useEditor } from "./state/store.ts";
import "./styles.css";

// Development only: lets browser tests and the console reach live editor state.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __motion: { useEditor, getHandle, flushSave, engine },
  });
}

// What this browser can do. Without the essentials, say so instead of
// showing a broken editor (and don't touch storage).
const support = checkSupport(browserEnv());
// Development only: ?preview=unsupported shows that screen.
const previewUnsupported =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("preview") === "unsupported";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

if (support.missing.length > 0 || previewUnsupported) {
  createRoot(root).render(
    <Unsupported
      missing={
        previewUnsupported
          ? ["WebGL 2 (to draw the video)", "WebCodecs (to read video files)"]
          : support.missing
      }
    />,
  );
} else {
  void startAutosave();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const limits = limitsMessage(support.limits);
  if (limits) useEditor.getState().toast(limits, "error");
}

// Installable and usable offline (production builds only; see pwa.ts).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .catch((err) => console.warn("[motion] offline support", err));
}
