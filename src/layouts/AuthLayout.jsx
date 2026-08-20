import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import BrandSplash from "@/components/BrandSplash";
import { YagonaLogo } from "@/components/brand";

export default function AuthLayout() {
  const [ready, setReady] = useState(() => {
    try {
      return sessionStorage.getItem("yagona-splash-done") === "1";
    } catch {
      return false;
    }
  });
  const finishSplash = useCallback(() => {
    try {
      sessionStorage.setItem("yagona-splash-done", "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  return (
    <div className={`auth-screen${ready ? " is-ready" : " is-booting"}`}>
      {!ready ? <BrandSplash onDone={finishSplash} /> : null}

      <aside className="auth-brand">
        <div className="auth-brand-pattern" aria-hidden="true" />

        <div className="auth-brand-content">
          <div className="auth-brand-top">
            <YagonaLogo mark size={116} className="auth-brand-logo" />
            <h1 className="auth-brand-name">Yagona</h1>
            <p className="auth-brand-tag">EdTech OS</p>
            <span className="auth-brand-rule" aria-hidden="true" />
          </div>

          <div className="auth-brand-bottom">
            <p className="auth-quote">Ilm — nur, jaholat — zulmat.</p>
            <p className="auth-quote-sub">
              Ta&apos;lim markazlari, CRM va o&apos;quvchilar — bitta tizimda.
            </p>
          </div>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <Outlet />
        </div>
      </section>
    </div>
  );
}
