import { APP_MODES } from "@/constants";
import { api, getSession, setSession } from "@/services/api/client";
import { results } from "@/utils/format";

export async function listPlatformTenants(params = "") {
  const query = params ? `?${params}` : "?page_size=100";
  return results(await api.get(`/platform/tenants${query}`, { tenant: false }));
}

export async function getPlatformTenant(id) {
  return api.get(`/platform/tenants/${id}`, { tenant: false });
}

export async function createPlatformTenant(payload) {
  return api.post("/platform/tenants", payload, { tenant: false });
}

export async function updatePlatformTenant(id, payload) {
  return api.patch(`/platform/tenants/${id}`, payload, { tenant: false });
}

export const patchPlatformTenant = updatePlatformTenant;

export async function listPlatformStudents(params = "") {
  const query = params ? `?${params}` : "?page_size=100";
  return results(await api.get(`/platform/students${query}`, { tenant: false }));
}

export async function platformStudentsSummary(tenantId = "") {
  const query = tenantId ? `?tenant=${tenantId}` : "";
  return api.get(`/platform/students/summary${query}`, { tenant: false });
}

export function enterEducationCenter(tenantId, tenantSlug = "") {
  const session = getSession();
  const membership = (session.memberships || []).find(
    (item) => String(item.tenant_id) === String(tenantId),
  );
  if (!membership && !session.user?.is_superuser) {
    throw new Error("Учебный центр не найден.");
  }
  const slug = String(tenantSlug || membership?.tenant_slug || "").toLowerCase();
  setSession({
    tenantId: String(tenantId),
    tenantSlug: slug,
    mode: APP_MODES.EDUCATION_ADMIN,
  });
  return membership || { tenant_id: String(tenantId), tenant_slug: slug };
}

export function enterSuperAdmin() {
  setSession({ mode: APP_MODES.SUPER_ADMIN });
}
