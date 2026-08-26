export function results(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(currency = "UZS") {
  const code = String(currency || "UZS").toUpperCase();
  if (code === "UZS" || code === "SUM" || code === "SOM") return "сум";
  return currency || "сум";
}

export function money(value, currency = "UZS") {
  if (value == null || value === "") return "—";
  const amount = Number(value);
  const label = currencyLabel(currency);
  if (Number.isNaN(amount)) return `${value} ${label}`;
  const fraction = Number.isInteger(amount) ? 0 : 2;
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
  return `${formatted} ${label}`;
}

export function normalizePriceDigits(value) {
  if (value == null || value === "") return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^\d+(\.\d+)?$/.test(str)) {
    const amount = Math.floor(Number(str));
    return amount > 0 ? String(amount) : "";
  }
  const digits = str.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

export function formatMoneyInput(value) {
  const raw = normalizePriceDigits(value);
  if (!raw) return "";
  return Number(raw).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function moneyInputSuffix(currency = "UZS") {
  return currencyLabel(currency);
}

export function priceToApi(value) {
  const raw = normalizePriceDigits(value);
  return raw || "0";
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
  const apiBase = String(import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/+$/, "");
  const origin = /^https?:\/\//i.test(apiBase)
    ? apiBase.replace(/\/api\/v1$/i, "")
    : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Looks like email / free text, not a phone number. */
export function looksLikeEmail(value) {
  return /[a-zA-Z@]/.test(String(value || ""));
}

export function uzPhoneLocalDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return (digits.startsWith("998") ? digits.slice(3) : digits).slice(0, 9);
}

export function formatUzPhoneLocal(value) {
  const local = uzPhoneLocalDigits(value);
  const parts = [];
  if (local.length > 0) parts.push(local.slice(0, 2));
  if (local.length > 2) parts.push(local.slice(2, 5));
  if (local.length > 5) parts.push(local.slice(5, 7));
  if (local.length > 7) parts.push(local.slice(7, 9));
  return parts.join(" ");
}

/** Display mask: +998 99 999 99 99 */
export function formatUzPhone(value) {
  const local = formatUzPhoneLocal(value);
  if (!local) return "";
  return `+998 ${local}`;
}

/** API/storage: +998XXXXXXXXX */
export function toApiPhone(value) {
  const local = uzPhoneLocalDigits(value);
  if (!local) return null;
  return `+998${local}`;
}

export function isPhoneLikeQuery(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (looksLikeEmail(trimmed)) return false;
  if (/^[+\d(]/.test(trimmed)) return true;
  if (/\d/.test(trimmed) && !/[a-zA-Zа-яА-ЯёЁ]/.test(trimmed)) return true;
  return false;
}

/** Mixed search fields: format phone queries, keep names/emails as typed. */
export function formatQueryWithPhone(value) {
  const trimmed = String(value || "");
  if (!trimmed) return "";
  if (looksLikeEmail(trimmed)) return trimmed;
  if (isPhoneLikeQuery(trimmed)) return formatUzPhone(trimmed);
  return value;
}

/** Value for API login: +998XXXXXXXXX or email as-is. */
export function toLoginIdentifier(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (looksLikeEmail(trimmed)) return trimmed;

  const apiPhone = toApiPhone(trimmed);
  return apiPhone || "";
}
