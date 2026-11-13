import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { getHandle } from "./state/media.ts";
import { useEditor } from "./state/store.ts";
import "./styles.css";

// Development only: lets browser tests and the console reach live editor state.
if (import.meta.env.DEV) {
  Object.assign(window, { __motion: { useEditor, getHandle } });
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
