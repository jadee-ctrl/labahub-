import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Atkinson Hyperlegible, bundled with the app (no request to Google Fonts).
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
