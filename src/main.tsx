import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/sofia-sans-extra-condensed/latin-800.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import App from "./app/App";
import "./styles/tokens.css";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
