/** Marker in lesson.topic for reception trial lessons (no parallel Visitor model). */
export const TRIAL_TOPIC_PREFIX = "ПРОБНЫЙ:";

export const SOURCE_OPTIONS = [
  { value: "manual", label: "Вручную / ресепшн" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "website", label: "Сайт" },
  { value: "other", label: "Другое" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Наличные" },
  { value: "click", label: "Click" },
  { value: "payme", label: "Payme" },
  { value: "card", label: "Карта" },
  { value: "bank_transfer", label: "Перевод" },
];

export function isTrialLesson(lesson) {
  return String(lesson?.topic || "").trim().toUpperCase().startsWith("ПРОБНЫЙ");
}

export function parseTrialTopic(topic = "") {
  const raw = String(topic || "");
  if (!raw.toUpperCase().startsWith("ПРОБНЫЙ")) {
    return { name: "", phone: "", comment: raw };
  }
  const body = raw.replace(/^ПРОБНЫЙ:\s*/i, "");
  const parts = body.split("·").map((p) => p.trim());
  return {
    name: parts[0] || "",
    phone: parts[1] || "",
    comment: parts.slice(2).join(" · "),
  };
}

export function buildTrialTopic({ name, phone, comment = "" }) {
  const bits = [TRIAL_TOPIC_PREFIX, name.trim(), phone.trim()].filter(Boolean);
  const base = bits.join(" · ").replace(`${TRIAL_TOPIC_PREFIX} ·`, `${TRIAL_TOPIC_PREFIX}`);
  return comment.trim() ? `${base} · ${comment.trim()}` : base;
}

export function isSameLocalDay(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function invoiceBalance(row) {
  if (!row) return 0;
  if (row.balance != null && row.balance !== "") return Number(row.balance);
  return Number(row.amount || 0) - Number(row.paid_amount || 0);
}

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function combineDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export function staffLabel(member) {
  if (!member) return "—";
  const user = member.user || {};
  return (
    user.name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    member.position ||
    "Сотрудник"
  );
}
