import React from "react";
import SystemBar from "./SystemBar";

const APP_NAME = "KájovoDagmar docházkový systém";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kb-app">
      <SystemBar right={<img src="/KajovoDagmar-dochazka.png" alt="" className="kb-app-logo" />} />
      <div className="kb-shell" aria-label={APP_NAME}>
        {children}
      </div>
    </div>
  );
}
