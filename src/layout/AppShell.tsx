import React from "react";
import { APP_NAME_LONG, BRAND_ASSETS } from "../brand/brand";
import SystemBar from "./SystemBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kb-app">
      <SystemBar right={<img src={BRAND_ASSETS.logoHorizontal} alt="" className="kb-app-logo" />} />
      <div className="kb-shell" aria-label={APP_NAME_LONG}>
        {children}
      </div>
    </div>
  );
}
