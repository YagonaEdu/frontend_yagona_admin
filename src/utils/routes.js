import { getSession } from "@/services/api/client";
import { APP_MODES } from "@/constants";
import { filterEducationNav } from "./roleAccess";

/** /education/inha/crm → inha */
export function parseEducationSlug(pathname = "") {
  const match = String(pathname).match(/^\/education\/([^/]+)/i);
  return match?.[1]?.toLowerCase() || "";
}

/** inha.education.yagona.uz → inha */
export function parseEducationSubdomain(hostname = "") {
  const host = String(hostname || "").split(":")[0].toLowerCase();
  const parts = host.split(".");
  const idx = parts.indexOf("education");
  if (idx > 0) return parts[idx - 1];
  return "";
}

export function educationHomePath(slug) {
  const clean = String(slug || "")
    .trim()
    .toLowerCase();
  if (!clean) return "/";
  return `/education/${encodeURIComponent(clean)}`;
}

/** Where to send an already-authenticated user. Never returns /login. */
export function resolveAuthedHome(session) {
  if (!session?.access) return null;
  if (session.user?.is_superuser && session.mode === APP_MODES.SUPER_ADMIN) {
    return "/super";
  }
  const slug = resolveEducationSlug(session);
  if (slug) return educationHomePath(slug);
  if (session.user?.is_superuser) return "/super";
  return null;
}
export function educationSegmentPath(slug, segment = "") {
  const base = educationHomePath(slug);
  if (!segment) return base;
  const clean = String(segment).replace(/^\/+/, "");
  return `${base}/${clean}`;
}

export function findMembershipBySlug(session, slug) {
  if (!slug) return null;
  const needle = String(slug).toLowerCase();
  return (
    (session.memberships || []).find(
      (item) => String(item.tenant_slug || "").toLowerCase() === needle,
    ) || null
  );
}

export function resolveEducationSlug(session = getSession(), pathname = "", hostname = "") {
  const fromPath = parseEducationSlug(pathname);
  if (fromPath) return fromPath;

  const fromHost = parseEducationSubdomain(hostname);
  if (fromHost) return fromHost;

  if (session.tenantSlug) return String(session.tenantSlug).toLowerCase();

  const byTenant = (session.memberships || []).find(
    (item) => String(item.tenant_id) === String(session.tenantId),
  );
  if (byTenant?.tenant_slug) return String(byTenant.tenant_slug).toLowerCase();

  return String(session.memberships?.[0]?.tenant_slug || "").toLowerCase();
}

export function buildEducationNav(role, slug, navMap) {
  const items = filterEducationNav(role, navMap[role] || navMap.owner);
  return items.map((item) => ({
    ...item,
    to: item.segment ? educationSegmentPath(slug, item.segment) : educationHomePath(slug),
  }));
}
