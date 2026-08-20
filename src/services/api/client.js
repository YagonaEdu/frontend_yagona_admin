const API_ROOT = String(import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api/v1").replace(
  /\/+$/,
  "",
);

function apiUrl(path) {
  const suffix = `/${String(path || "").replace(/^\/+/, "")}`;
  return `${API_ROOT}${suffix}`;
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(formatMessage(status, payload));
    this.status = status;
    this.payload = payload;
  }
}

function formatMessage(status, payload) {
  if (!payload) return `Ошибка ${status}`;
  const details = flattenDetails(payload.details);
  if (details) return `${payload.message || "Ошибка"}: ${details}`;
  return payload.message || `Ошибка ${status}`;
}

function flattenDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) return details.map(String).join(", ");
  if (typeof details === "object") {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${flattenDetails(value)}`)
      .join("; ");
  }
  return String(details);
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function refreshAccess() {
  const { refresh } = getSession();
  if (!refresh) return false;
  const response = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  const data = await parseBody(response);
  if (!response.ok) {
    clearSession();
    return false;
  }
  setSession({ access: data.access, refresh: data.refresh || refresh });
  return true;
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getSession() {
  return {
    access: localStorage.getItem("access") || "",
    refresh: localStorage.getItem("refresh") || "",
    tenantId: localStorage.getItem("tenantId") || "",
    tenantSlug: localStorage.getItem("tenantSlug") || "",
    mode: localStorage.getItem("mode") || "",
    user: safeJsonParse(localStorage.getItem("user"), null),
    memberships: safeJsonParse(localStorage.getItem("memberships"), []),
  };
}

function serializeSessionValue(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function setSession(partial) {
  let changed = false;
  for (const [key, value] of Object.entries(partial)) {
    const next = serializeSessionValue(value);
    const prev = localStorage.getItem(key);
    if (next == null) {
      if (prev != null) {
        localStorage.removeItem(key);
        changed = true;
      }
      continue;
    }
    if (prev !== next) {
      localStorage.setItem(key, next);
      changed = true;
    }
  }
  if (changed) window.dispatchEvent(new Event("yagona-session"));
}

export function clearSession() {
  ["access", "refresh", "tenantId", "tenantSlug", "mode", "user", "memberships"].forEach((key) =>
    localStorage.removeItem(key),
  );
  window.dispatchEvent(new Event("yagona-session"));
}

export async function request(path, { method = "GET", body, tenant = true, retry = true } = {}) {
  const session = getSession();
  const headers = { Accept: "application/json" };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (session.access) headers.Authorization = `Bearer ${session.access}`;
  if (tenant && session.tenantId) headers["X-Tenant-ID"] = session.tenantId;

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (response.status === 401 && retry && session.refresh) {
    const ok = await refreshAccess();
    if (ok) return request(path, { method, body, tenant, retry: false });
  }

  const data = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),
};
