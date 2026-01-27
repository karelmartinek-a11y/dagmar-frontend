import React from "react";

export type DeviceVariant = "mobile" | "tablet" | "desktop";

function computeVariant(): DeviceVariant {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function useDeviceVariant(): DeviceVariant {
  const [v, setV] = React.useState<DeviceVariant>(() => {
    if (typeof window === "undefined") return "desktop";
    return computeVariant();
  });

  React.useEffect(() => {
    const apply = (next: DeviceVariant) => {
      try {
        document.documentElement.dataset.device = next;
      } catch {
        // ignore
      }
    };

    apply(v);

    let raf = 0;
    const onResize = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const next = computeVariant();
        setV((cur) => {
          if (cur === next) return cur;
          apply(next);
          return next;
        });
      });
    };

    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [v]);

  return v;
}
