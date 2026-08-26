const API_ROOT = String(import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/+$/, "");
const GET_CACHE_TTL_MS = 15000;
const getCache = new Map();
let refreshPromise = null;

function apiUrl(path) {
  const suffix = `/${String(path || "").replace(/^\/+/, "")}`;
  return `${API_ROOT}${suffix}`;
}

function cacheKey(path, tenantId) {
  return `${tenantId || "no-tenant"}:${path}`;
}

function readCache(key) {
  const hit = getCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > GET_CACHE_TTL_MS) {
    getCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeCache(key, data) {
  getCache.set(key, { at: Date.now(), data });
}

export function invalidateApiCache(prefix = "") {
  if (!prefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.includes(prefix)) getCache.delete(key);
  }
}

function notifyAuthExpired() {
  window.dispatchEvent(new Event("yagona-auth-expired"));
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
  const message = payload.message || payload.detail || `Ошибка ${status}`;
  if (message && !String(message).includes("ErrorDetail")) return message;
  const details = flattenDetails(payload.details);
  return details || message || `Ошибка ${status}`;
}

function flattenDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) {
    return details.map((item) => flattenDetails(item)).filter(Boolean).join(", ");
  }
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
    tenant: "Учебный центр",
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
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refresh } = getSession();
    if (!refresh) return false;

    try {
      const response = await fetch(apiUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      const data = await parseBody(response);
      if (!response.ok) {
        clearSession();
        notifyAuthExpired();
        return false;
      }
      setSessionSilent({
        access: data.access,
        refresh: data.refresh || refresh,
      });
      return true;
    } catch {
      clearSession();
      notifyAuthExpired();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
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
  getCache.clear();
  refreshPromise = null;
  window.dispatchEvent(new Event("yagona-session"));
}

export async function request(
  path,
  { method = "GET", body, tenant = true, retry = true, cache = false } = {},
) {
  const session = getSession();

  if (tenant && !session.tenantId) {
    throw new ApiError(400, {
      message: "Учебный центр не выбран. Войдите снова.",
      details: { tenant: "X-Tenant-ID header is required." },
    });
  }

  const headers = { Accept: "application/json" };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (session.access) headers.Authorization = `Bearer ${session.access}`;
  if (tenant && session.tenantId) headers["X-Tenant-ID"] = session.tenantId;

  const isGet = method === "GET";
  const key = cacheKey(path, tenant ? session.tenantId : "");
  if (isGet && cache) {
    const cached = readCache(key);
    if (cached !== null) return cached;
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (response.status === 401 && retry) {
    const live = getSession();
    if (live.refresh) {
      const ok = await refreshAccess();
      if (ok) {
        return request(path, { method, body, tenant, retry: false, cache });
      }
      throw new ApiError(401, { message: "Сессия истекла. Войдите снова." });
    }
    clearSession();
    notifyAuthExpired();
    throw new ApiError(401, { message: "Требуется авторизация." });
  }

  const data = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, data);

  if (isGet && cache) writeCache(key, data);
  if (!isGet) invalidateApiCache(tenant ? session.tenantId : "");

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),
};
