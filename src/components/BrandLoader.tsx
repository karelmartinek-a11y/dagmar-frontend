import React from "react";

export type BrandLoaderMode = "loading" | "uploading" | "error";

export function BrandLoader(props: {
  title?: string;
  subtitle?: string;
  mode?: BrandLoaderMode;
  fullscreen?: boolean;
  logoSrc: string;
}) {
  const { title = "Načítám…", subtitle, mode = "loading", fullscreen = false, logoSrc } = props;

  const [hint, setHint] = React.useState<string>("Probíhá načítání");
  const [sinceMs, setSinceMs] = React.useState<number>(0);

  React.useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setSinceMs(Date.now() - t0), 250);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    // 0-2s: standard, 2-6s: still loading, 6s+: connectivity hint
    if (mode === "error") {
      setHint("Něco se nepovedlo");
      return;
    }
    if (mode === "uploading") {
      setHint("Odesílám data");
      return;
    }
    if (sinceMs < 2_000) setHint("Probíhá načítání");
    else if (sinceMs < 6_000) setHint("Ještě chvilku…");
    else setHint("Ověřuji připojení a dostupnost serveru…");
  }, [sinceMs, mode]);

  const content = (
    <div className="dg-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="dg-loader-head">
        <div className="dg-loader-logo" aria-hidden="true">
          <img src={logoSrc} alt="" decoding="async" loading="eager" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="dg-loader-title">{title}</div>
          <div className="dg-loader-subtitle">{subtitle ?? hint}</div>
        </div>
      </div>

      <div className="dg-progress" data-mode={mode}>
        <div />
      </div>

      <div className="dg-loader-hints">
        <span>{mode === "uploading" ? "Upload" : "Načítání"}</span>
        <span>{Math.floor(sinceMs / 1000)}s</span>
      </div>
    </div>
  );

  if (fullscreen) return <div className="dg-loader-backdrop">{content}</div>;
  return content;
}
