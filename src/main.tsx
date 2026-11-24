import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Login from "./Login";
import { resume, signOut } from "./vault";
import "./styles.css";

function Root() {
  const [state, setState] = useState<"checking" | "out" | "in">("checking");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("insights-theme");
      document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch { /* storage unavailable */ }
    resume().then((ok) => setState(ok ? "in" : "out"));
  }, []);
  if (state === "checking") return <div className="login"><div className="empty">Loading…</div></div>;
  if (state === "out") return <Login onSignedIn={() => setState("in")} />;
  return <App onSignOut={() => { signOut(); setState("out"); }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
