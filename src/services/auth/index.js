import { APP_MODES, ROLES } from "@/constants";
import {
  api,
  clearSession,
  getSession,
  setSession,
  setSessionSilent,
} from "@/services/api/client";

export async function login(identifier, password) {
  const tokens = await api.post(
    "/auth/token",
    { identifier, password },
    { tenant: false },
  );

  // Keep tokens available for /me/tenants without flipping the UI into "authed"
  // mid-flight (that used to race with AuthedLoginRedirect → clearSession).
  setSessionSilent({
    access: tokens.access,
    refresh: tokens.refresh,
  });

  let memberships;
  try {
    memberships = await api.get("/me/tenants", { tenant: false });
  } catch (err) {
    clearSession();
    throw err;
  }

  const staffMemberships = (memberships || []).filter((item) => item.role !== ROLES.STUDENT);
  const isSuper = Boolean(tokens.user?.is_superuser);

  if (!staffMemberships.length && !isSuper) {
    clearSession();
    throw new Error("Нет доступа к админке. Нужна роль сотрудника центра или superuser Yagona.");
  }

  if (isSuper) {
    const membership = staffMemberships[0] || null;
    setSession({
      access: tokens.access,
      refresh: tokens.refresh,
      user: tokens.user,
      memberships: staffMemberships,
      tenantId: membership?.tenant_id || "",
      tenantSlug: membership?.tenant_slug || "",
      mode: APP_MODES.SUPER_ADMIN,
    });
    return { mode: APP_MODES.SUPER_ADMIN, memberships: staffMemberships, membership };
  }

  const membership = staffMemberships[0];
  setSession({
    access: tokens.access,
    refresh: tokens.refresh,
    user: tokens.user,
    memberships: staffMemberships,
    tenantId: membership.tenant_id,
    tenantSlug: membership.tenant_slug || "",
    mode: APP_MODES.EDUCATION_ADMIN,
  });
  return { mode: APP_MODES.EDUCATION_ADMIN, memberships: staffMemberships, membership };
}

export async function logout() {
  const session = getSession();
  try {
    if (session.refresh) {
      await api.post("/auth/logout", { refresh: session.refresh }, { tenant: false });
    }
  } catch {
    /* local logout still */
  }
  clearSession();
}

export function currentMembership(session = getSession()) {
  return (
    session.memberships.find((item) => item.tenant_id === session.tenantId) ||
    session.memberships[0] ||
    null
  );
}

export function canAccessSuperAdmin(session = getSession()) {
  return Boolean(session.access && session.user?.is_superuser);
}

export function canAccessEducationAdmin(session = getSession()) {
  if (!session.access) return false;
  if (session.user?.is_superuser) return true;
  const membership = currentMembership(session);
  return Boolean(
    membership &&
      [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER, ROLES.ACCOUNTANT].includes(membership.role),
  );
}
