import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

function SplashGate() {
  const [showSplash, setShowSplash] = React.useState(true);

  React.useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 5000);
    return () => window.clearTimeout(t);
  }, []);

  if (showSplash) {
    const logoUrl = "/brand/logo.svg";
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#ffffff",
          display: "grid",
          placeItems: "center",
        }}
      >
        <img
          src={logoUrl}
          alt="DAGMAR"
          style={{ width: "60vw", maxWidth: 520, height: "auto", objectFit: "contain" }}
        />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SplashGate />
  </React.StrictMode>
);

export default SplashGate;
