import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui";
import { ROLE_LABELS, ROLES } from "@/constants";
import { enterSuperAdmin } from "@/services/tenant";
import { educationHomePath } from "@/utils/routes";

function roleSubtitle(role, membership) {
  if (membership?.position) return membership.position;
  if (role === ROLES.ADMIN) return "Ресепшен";
  if (role === ROLES.OWNER) return "Учебный центр";
  if (role === ROLES.TEACHER) return "Преподаватель";
  if (role === ROLES.ACCOUNTANT) return "Финансы";
  return membership?.tenant_name || "Кабинет";
}

function roleTitle(role) {
  if (role === ROLES.ADMIN) return "Администратор";
  return ROLE_LABELS[role] || role || "Пользователь";
}

export default function CabinetUserMenu({
  session,
  membership,
  role,
  settingsPath,
  onLogout,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const title = roleTitle(role);
  const subtitle = roleSubtitle(role, membership);
  const displayName = session.user?.name || session.user?.email || title;

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`cabinet-user-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="cabinet-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={displayName} />
        <span className="cabinet-user-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <svg
          className="cabinet-user-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.25 6 7.75l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="cabinet-user-dropdown" role="menu">
          <div className="cabinet-user-meta">
            <strong>{displayName}</strong>
            <span>{session.user?.email || session.user?.phone || "—"}</span>
          </div>

          {session.memberships?.length > 1 ? (
            <label className="cabinet-user-switch">
              <span>Учебный центр</span>
              <select
                value={membership?.tenant_id || session.tenantId}
                onChange={(event) => {
                  const next = session.memberships.find(
                    (item) => String(item.tenant_id) === event.target.value,
                  );
                  if (next?.tenant_slug) {
                    setOpen(false);
                    navigate(educationHomePath(next.tenant_slug));
                  }
                }}
              >
                {session.memberships.map((item) => (
                  <option key={item.tenant_id} value={item.tenant_id}>
                    {item.tenant_name} ({ROLE_LABELS[item.role] || item.role})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {settingsPath ? (
            <button
              type="button"
              role="menuitem"
              className="cabinet-user-item"
              onClick={() => {
                setOpen(false);
                navigate(settingsPath);
              }}
            >
              Настройки
            </button>
          ) : null}

          {session.user?.is_superuser ? (
            <button
              type="button"
              role="menuitem"
              className="cabinet-user-item"
              onClick={() => {
                setOpen(false);
                enterSuperAdmin();
                navigate("/super");
              }}
            >
              Кабинет Yagona
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="cabinet-user-item is-danger"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
