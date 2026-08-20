import { useEffect, useState } from "react";
import { YagonaLogo } from "@/components/brand";

const SPLASH_MS = 1700;
const FADE_MS = 420;

export default function BrandSplash({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 300 : SPLASH_MS;
    const fade = reduced ? 100 : FADE_MS;

    const leaveTimer = window.setTimeout(() => setLeaving(true), hold);
    const doneTimer = window.setTimeout(() => onDone?.(), hold + fade);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`brand-splash${leaving ? " is-leaving" : ""}`} role="status" aria-live="polite">
      <div className="brand-splash-pattern" aria-hidden="true" />

      <div className="brand-splash-core">
        <YagonaLogo mark size={112} className="brand-splash-logo" />
        <p className="brand-splash-name">Yagona</p>
        <p className="brand-splash-tag">EdTech OS</p>
        <div className="brand-splash-bar" aria-hidden="true">
          <span className="brand-splash-bar-fill" />
        </div>
      </div>
    </div>
  );
}
