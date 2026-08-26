import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { BrandMark } from "@/components/brand";
import CabinetUserMenu from "@/components/layout/CabinetUserMenu";
import { GroupedNav } from "@/components/layout/GroupedNav";
import { IconChevron } from "@/components/layout/navIcons";
import SupportWidget from "@/components/layout/SupportWidget";
import { APP_MODES, EDUCATION_NAV, ROLE_LABELS } from "@/constants";
import { setSession } from "@/services/api/client";
import {
  buildEducationNav,
  educationHomePath,
  findMembershipBySlug,
} from "@/utils/routes";

const SIDEBAR_KEY = "yagona-education-sidebar-collapsed";

export default function EducationAdminLayout({ session, onLogout }) {
  const { tenantSlug = "" } = useParams();
  const slug = String(tenantSlug).toLowerCase();
  const membership = findMembershipBySlug(session, slug);
  const superInCenter =
    session.user?.is_superuser &&
    session.tenantId &&
    String(session.tenantSlug || "").toLowerCase() === slug;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 961px)").matches : true,
  );

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const collapsed = sidebarCollapsed && isDesktop;

  const membershipId = membership?.id || "";
  const membershipTenantId = membership ? String(membership.tenant_id) : "";

  useEffect(() => {
    if (membershipId && membershipTenantId) {
      const needsSync =
        membershipTenantId !== String(session.tenantId || "") ||
        session.mode !== APP_MODES.EDUCATION_ADMIN ||
        String(session.tenantSlug || "").toLowerCase() !== slug;
      if (needsSync) {
        setSession({
          tenantId: membershipTenantId,
          tenantSlug: slug,
          mode: APP_MODES.EDUCATION_ADMIN,
        });
      }
      return;
    }
    if (superInCenter && session.mode !== APP_MODES.EDUCATION_ADMIN) {
      setSession({ mode: APP_MODES.EDUCATION_ADMIN });
    }
  }, [
    membershipId,
    membershipTenantId,
    superInCenter,
    slug,
    session.mode,
    session.tenantId,
    session.tenantSlug,
  ]);

  if (!membership && !superInCenter) {
    if (session.memberships?.length) {
      return <Navigate to={educationHomePath(session.memberships[0].tenant_slug)} replace />;
    }
    if (session.user?.is_superuser) {
      return <Navigate to="/super" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  const role = membership?.role || "owner";
  const links = buildEducationNav(role, slug, EDUCATION_NAV);
  const settingsPath =
    role === "teacher"
      ? `/education/${slug}/profile`
      : `/education/${slug}/settings`;
  const roleHint =
    membership?.position && membership.position !== ROLE_LABELS[role]
      ? membership.position
      : role === "admin"
        ? "Ресепшен"
        : role === "teacher"
          ? "Преподаватель"
          : role === "owner"
            ? "Учебный центр"
            : "";
  const tenantInitial = (membership?.tenant_name || slug || "Y").trim().charAt(0).toUpperCase();

  return (
    <div className={`shell shell-education${collapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
        <div className="sidebar-head">
          <BrandMark
            title="Yagona"
            subtitle={role === "teacher" ? "Преподаватель" : "Кабинет центра"}
            compact={collapsed}
            iconOnly={collapsed}
          />
          {isDesktop ? (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            >
              <IconChevron collapsed={collapsed} />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="sidebar-context-compact" title={membership?.tenant_name || slug}>
            <span className="sidebar-context-mark">{tenantInitial}</span>
          </div>
        ) : (
          <div className="sidebar-context">
            <div className="sidebar-context-body">
              <div className="sidebar-context-mark" aria-hidden="true">
                {tenantInitial}
              </div>
              <div className="sidebar-context-copy">
                <p className="tenant-name" title={membership?.tenant_name || slug}>
                  {membership?.tenant_name || slug}
                </p>
                {roleHint ? <span className="sidebar-context-hint">{roleHint}</span> : null}
              </div>
            </div>
          </div>
        )}

        <GroupedNav items={links} collapsed={collapsed} />

        <div className="sidebar-foot">
          <SupportWidget collapsed={collapsed} />
        </div>
      </aside>
      <main className="main">
        <header className="cabinet-header">
          <div className="cabinet-header-center">
            <strong>{membership?.tenant_name || slug}</strong>
          </div>
          <CabinetUserMenu
            session={session}
            membership={membership}
            role={role}
            settingsPath={settingsPath}
            onLogout={onLogout}
          />
        </header>
        <div className="main-stage page-container">
          <Outlet key={session.tenantId} />
        </div>
      </main>
    </div>
  );
}
