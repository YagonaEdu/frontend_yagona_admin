import { Outlet, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/brand";
import { GroupedNav } from "@/components/layout/GroupedNav";
import { Avatar } from "@/components/ui";
import { SUPER_ADMIN_NAV } from "@/constants";
import { enterEducationCenter } from "@/services/tenant";
import { educationHomePath } from "@/utils/routes";

export default function SuperAdminLayout({ session, onLogout }) {
  const navigate = useNavigate();
  const firstMembership = session.memberships?.[0];

  return (
    <div className="shell shell-super">
      <aside className="sidebar">
        <BrandMark title="Yagona" subtitle="Super Admin" />
        <div className="sidebar-context">
          <p className="tenant-name">Платформа Yagona</p>
          <span className="role-chip">Все центры</span>
        </div>
        <GroupedNav items={SUPER_ADMIN_NAV} />
        <div className="sidebar-foot">
          <div className="sidebar-account">
            <div className="sidebar-account-main">
              <Avatar name={session.user?.name || session.user?.email} />
              <div className="sidebar-account-copy">
                <strong>{session.user?.name || session.user?.email || "Пользователь"}</strong>
                <span>{session.user?.email || session.user?.phone || "—"}</span>
                <em className="sidebar-account-role">Super Admin</em>
              </div>
            </div>
            <div className="sidebar-account-actions">
              {firstMembership ? (
                <button
                  type="button"
                  className="sidebar-account-btn is-soft"
                  onClick={() => {
                    enterEducationCenter(firstMembership.tenant_id, firstMembership.tenant_slug);
                    navigate(educationHomePath(firstMembership.tenant_slug));
                  }}
                >
                  В кабинет центра
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
        <div className="main-stage">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
