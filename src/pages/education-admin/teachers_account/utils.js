import { STATUS_LABELS } from "@/constants";
import { api, ApiError } from "@/services/api/client";
import { results, today } from "@/utils/format";

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Присутствовал", icon: "✓" },
  { value: "late", label: "Опоздал", icon: "◷" },
  { value: "absent", label: "Отсутствовал", icon: "×" },
  { value: "excused", label: "Уважительная", icon: "✓" },
];

export const ASSIGNMENT_STATUS_LABELS = {
  draft: "Черновик",
  published: "Опубликовано",
  closed: "Завершено",
  not_submitted: "Не сдано",
  submitted: "Сдано",
  late: "С опозданием",
  graded: "Проверено",
};

export function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
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

export function lessonStatus(lesson, attendanceCount = 0, expectedCount = 0) {
  const now = Date.now();
  const start = new Date(lesson.starts_at).getTime();
  const end = new Date(lesson.ends_at).getTime();
  if (now < start) return "upcoming";
  if (now >= start && now <= end) return "ongoing";
  if (expectedCount > 0 && attendanceCount < expectedCount) return "unmarked";
  return "completed";
}

export function lessonStatusLabel(status) {
  const map = {
    upcoming: "Предстоит",
    ongoing: "Идёт сейчас",
    completed: "Завершено",
    unmarked: "Посещаемость не отмечена",
  };
  return map[status] || status;
}

export function minutesUntil(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

export async function asList(path) {
  try {
    return results(await api.get(path, { cache: true }));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    return [];
  }
}

export function staffLabel(user) {
  if (!user) return "—";
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "—";
}

export function membershipName(membership, sessionUser) {
  if (sessionUser) return staffLabel(sessionUser);
  if (!membership?.user) return "Преподаватель";
  return staffLabel(membership.user);
}

export function formatLocalDateLong(date = new Date(), options = {}) {
  if (options.withWeekday) {
    const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const weekday = date.toLocaleDateString("ru-RU", { weekday: "long" });
    return `${dayMonth}, ${weekday}`;
  }
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr || today()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function statusBadgeTone(status) {
  if (["present", "graded", "active", "completed"].includes(status)) return "green";
  if (["late", "partial", "ongoing"].includes(status)) return "orange";
  if (["absent", "not_submitted", "unmarked"].includes(status)) return "red";
  return "blue";
}

export function assignmentTabFilter(tab, row) {
  if (tab === "active") return row.status === "published";
  if (tab === "review") {
    return row.status === "published" && Number(row.submitted_count || 0) > Number(row.graded_count || 0);
  }
  if (tab === "closed") return row.status === "closed";
  if (tab === "draft") return row.status === "draft";
  return true;
}

const OPEN_INVOICE_STATUSES = new Set(["issued", "partially_paid", "overdue"]);

export function invoiceBalance(invoice) {
  if (!invoice) return 0;
  if (invoice.balance != null && invoice.balance !== "") return Number(invoice.balance);
  return Number(invoice.amount || 0) - Number(invoice.paid_amount || 0);
}

export function computeStudentDebt(studentId, invoices = []) {
  return invoices
    .filter(
      (row) =>
        String(row.student) === String(studentId) && OPEN_INVOICE_STATUSES.has(row.status),
    )
    .reduce((sum, row) => sum + invoiceBalance(row), 0);
}

export async function optionalList(path) {
  try {
    return results(await api.get(path, { cache: true }));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return [];
    return [];
  }
}

export function attachGuardiansToStudents(students = [], guardians = [], links = []) {
  const guardianMap = new Map(guardians.map((row) => [String(row.id), row]));
  const byStudent = new Map();
  for (const link of links) {
    const guardian = guardianMap.get(String(link.guardian));
    if (!guardian) continue;
    const key = String(link.student);
    const list = byStudent.get(key) || [];
    list.push({
      ...guardian,
      relationship: link.relationship,
      is_primary: link.is_primary,
      link_id: link.id,
    });
    byStudent.set(key, list);
  }
  return students.map((student) => {
    const list = [...(byStudent.get(String(student.id)) || [])].sort(
      (a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)),
    );
    return {
      ...student,
      guardians: list,
      guardian: list[0] || null,
    };
  });
}

export { STATUS_LABELS, today };
