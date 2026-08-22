const API_ROOT = String(import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/+$/, "");

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
  const message = payload.message || `Ошибка ${status}`;
  if (message && !String(message).includes("ErrorDetail")) return message;
  const details = flattenDetails(payload.details);
  return details || message || `Ошибка ${status}`;
}

function flattenDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) return details.map((item) => flattenDetails(item)).filter(Boolean).join(", ");
  if (typeof details === "object") {
    return Object.entries(details)
      .map(([key, value]) => {
        const text = flattenDetails(value);
        if (!text) return "";
        return key === "detail" || key === "non_field_errors" ? text : `${fieldLabel(key)}: ${text}`;
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(details);
}

function fieldLabel(key) {
  const labels = {
    paid_amount: "Сумма выплаты",
    accrued_amount: "Начисление",
    membership: "Сотрудник",
    period: "Период",
    status: "Статус",
  };
  return labels[key] || key;
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

function writeSession(partial, { emit = true } = {}) {
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
  if (changed && emit) window.dispatchEvent(new Event("yagona-session"));
  return changed;
}

export function setSession(partial) {
  writeSession(partial, { emit: true });
}

/** Write session keys without notifying React (used mid-login). */
export function setSessionSilent(partial) {
  writeSession(partial, { emit: false });
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
