import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// Self-hosted fonts — bundled via @fontsource, no CDN request at runtime.
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/quicksand/600.css";
import "@fontsource/quicksand/700.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
