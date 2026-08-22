import { useEffect } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { BrandMark } from "@/components/brand";
import { GroupedNav } from "@/components/layout/GroupedNav";
import { Avatar } from "@/components/ui";
import { APP_MODES, EDUCATION_NAV, ROLE_LABELS } from "@/constants";
import { setSession } from "@/services/api/client";
import { enterSuperAdmin } from "@/services/tenant";
import {
  buildEducationNav,
  educationHomePath,
  findMembershipBySlug,
} from "@/utils/routes";

export default function EducationAdminLayout({ session, onLogout }) {
  const navigate = useNavigate();
  const { tenantSlug = "" } = useParams();
  const slug = String(tenantSlug).toLowerCase();
  const membership = findMembershipBySlug(session, slug);
  const superInCenter =
    session.user?.is_superuser &&
    session.tenantId &&
    String(session.tenantSlug || "").toLowerCase() === slug;

  useEffect(() => {
    if (membership) {
      const needsSync =
        String(membership.tenant_id) !== String(session.tenantId || "") ||
        session.mode !== APP_MODES.EDUCATION_ADMIN ||
        String(session.tenantSlug || "").toLowerCase() !== slug;
      if (needsSync) {
        setSession({
          tenantId: String(membership.tenant_id),
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
    membership,
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

  return (
    <div className="shell shell-education">
      <aside className="sidebar">
        <BrandMark title="Yagona" subtitle="Кабинет центра" />
        <div className="sidebar-context">
          <p className="tenant-name">{membership?.tenant_name || slug}</p>
          <span className="role-chip">{ROLE_LABELS[role] || role}</span>
        </div>
        <GroupedNav items={links} />
        <div className="sidebar-foot">
          <div className="sidebar-account">
            <div className="sidebar-account-main">
              <Avatar name={session.user?.name || session.user?.email} />
              <div className="sidebar-account-copy">
                <strong>{session.user?.name || session.user?.email || "Пользователь"}</strong>
                <span>{session.user?.email || session.user?.phone || "—"}</span>
                {role ? (
                  <em className="sidebar-account-role">{ROLE_LABELS[role] || role}</em>
                ) : null}
              </div>
            </div>
            {session.memberships?.length > 1 ? (
              <label className="tenant-switch">
                <span>Учебный центр</span>
                <select
                  value={membership?.tenant_id || session.tenantId}
                  onChange={(event) => {
                    const next = session.memberships.find(
                      (item) => String(item.tenant_id) === event.target.value,
                    );
                    if (next?.tenant_slug) navigate(educationHomePath(next.tenant_slug));
                  }}
                  aria-label="Учебный центр"
                >
                  {session.memberships.map((item) => (
                    <option key={item.tenant_id} value={item.tenant_id}>
                      {item.tenant_name} ({ROLE_LABELS[item.role] || item.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="sidebar-account-actions">
              {session.user?.is_superuser ? (
                <button
                  type="button"
                  className="sidebar-account-btn is-soft"
                  onClick={() => {
                    enterSuperAdmin();
                    navigate("/super");
                  }}
                >
                  Кабинет Yagona
                </button>
              ) : null}
              <button type="button" className="sidebar-account-btn is-logout" onClick={onLogout}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="main-stage page-container">
          <Outlet key={session.tenantId} />
        </div>
      </main>
    </div>
  );
}
