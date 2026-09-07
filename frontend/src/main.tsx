import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./index.css";
import App from "./App";

const savedTheme = localStorage.getItem("theme") ||
  (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
document.documentElement.setAttribute("data-theme", savedTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
