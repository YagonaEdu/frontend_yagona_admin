export function results(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function money(value, currency = "UZS") {
  if (value == null || value === "") return "—";
  const amount = Number(value);
  if (Number.isNaN(amount)) return `${value} ${currency}`;
  const fraction = Number.isInteger(amount) ? 0 : 2;
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
  return `${formatted} ${currency}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const raw = String(value).includes("T") ? value : `${value}T12:00:00`;
  return new Date(raw).toLocaleDateString("ru-RU");
}

export function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function formatDay(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function addDays(value, days) {
  const base = value && value >= today() ? value : today();
  const date = new Date(`${base}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nameOf(list, id, field = "name") {
  const item = (list || []).find((entry) => String(entry.id) === String(id));
  return item ? item[field] || item.full_name : id ? String(id).slice(0, 8) : "—";
}

export function nowLocalInput(hoursAhead = 1) {
  const date = new Date(Date.now() + hoursAhead * 3600 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function toIso(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

/** Absolute media URL for Django file fields. */
export function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const apiBase = String(import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api/v1").replace(
    /\/+$/,
    "",
  );
  const origin = apiBase.replace(/\/api\/v1$/i, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Looks like email / free text, not a phone number. */
export function looksLikeEmail(value) {
  return /[a-zA-Z@]/.test(String(value || ""));
}

/** Display mask: +998 99 999 99 99 */
export function formatUzPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  let local = digits.startsWith("998") ? digits.slice(3) : digits;
  local = local.slice(0, 9);

  const parts = [];
  if (local.length > 0) parts.push(local.slice(0, 2));
  if (local.length > 2) parts.push(local.slice(2, 5));
  if (local.length > 5) parts.push(local.slice(5, 7));
  if (local.length > 7) parts.push(local.slice(7, 9));

  return parts.length ? `+998 ${parts.join(" ")}` : "+998";
}

/** Value for API login: +998XXXXXXXXX or email as-is. */
export function toLoginIdentifier(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (looksLikeEmail(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits === "998") return "";
  const withCode = digits.startsWith("998") ? digits : `998${digits}`;
  return `+${withCode}`;
}
