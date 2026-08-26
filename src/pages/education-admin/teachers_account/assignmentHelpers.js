import { formatDate, formatTime } from "@/utils/format";

export function pendingReviewCount(row) {
  return Math.max(0, Number(row.submitted_count || 0) - Number(row.graded_count || 0));
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

export function assignmentDueMeta(dueAt, status) {
  if (!dueAt || status === "closed" || status === "draft") return null;
  const due = new Date(dueAt);
  const now = new Date();
  if (due < now && status === "published") {
    return { label: "Срок прошёл", tone: "overdue" };
  }
  if (isSameLocalDay(dueAt)) {
    return { label: "Срок сегодня", tone: "today" };
  }
  return null;
}

export function assignmentStatusLabel(row) {
  if (row.status === "draft") return { label: "Черновик", tone: "muted" };
  if (row.status === "closed") return { label: "Завершено", tone: "muted" };
  const due = assignmentDueMeta(row.due_at, row.status);
  if (due) return due;
  return { label: "Активно", tone: "active" };
}

export function formatDueLabel(dueAt) {
  if (!dueAt) return "—";
  return `${formatDate(dueAt)} · ${formatTime(dueAt)}`;
}

export function filterAssignmentTab(tab, row) {
  if (tab === "all") return true;
  if (tab === "active") return row.status === "published";
  if (tab === "review") return row.status === "published" && pendingReviewCount(row) > 0;
  if (tab === "closed") return row.status === "closed";
  if (tab === "draft") return row.status === "draft";
  return true;
}

export function sortAssignments(rows = []) {
  return [...rows].sort((a, b) => {
    const reviewA = pendingReviewCount(a);
    const reviewB = pendingReviewCount(b);
    if (reviewB !== reviewA) return reviewB - reviewA;

    const dueA = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const dueB = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    const now = Date.now();
    const urgentA = a.status === "published" && dueA >= now ? dueA : Infinity;
    const urgentB = b.status === "published" && dueB >= now ? dueB : Infinity;
    if (urgentA !== urgentB) return urgentA - urgentB;

    if (a.status === "closed" && b.status !== "closed") return 1;
    if (b.status === "closed" && a.status !== "closed") return -1;

    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export function buildAttentionItems(rows = [], groupMap) {
  const items = [];
  rows.forEach((row) => {
    const pending = pendingReviewCount(row);
    const missing = Number(row.missing_count || 0);
    const due = assignmentDueMeta(row.due_at, row.status);
    const groupName = groupMap.get(String(row.group))?.name || "—";

    if (pending > 0) {
      items.push({
        key: `review-${row.id}`,
        kind: "review",
        title: `${pending} ${pending === 1 ? "работа" : "работ"} ждут проверки`,
        subtitle: `${groupName} · ${row.title}`,
        action: "Проверить",
        assignment: row,
        mode: "review",
      });
    }
    if (missing > 0) {
      items.push({
        key: `missing-${row.id}`,
        kind: "missing",
        title: `${missing} ${missing === 1 ? "ученик не сдал" : "ученика не сдали"}`,
        subtitle: `${groupName} · ${row.title}`,
        action: "Напомнить",
        assignment: row,
        mode: "missing",
      });
    }
    if (due?.tone === "today") {
      items.push({
        key: `due-${row.id}`,
        kind: "due",
        title: "Срок сегодня",
        subtitle: `${groupName} · ${row.title}`,
        action: "Открыть",
        assignment: row,
        mode: "open",
      });
    }
  });
  return items.slice(0, 6);
}

export function submissionStatusLabel(status) {
  const map = {
    not_submitted: "Не сдано",
    submitted: "Сдано",
    late: "Сдано поздно",
    graded: "Проверено",
  };
  return map[status] || status;
}

export function submissionStatusTone(status) {
  if (status === "graded") return "green";
  if (status === "not_submitted") return "warn";
  if (status === "late") return "warn";
  return "blue";
}
