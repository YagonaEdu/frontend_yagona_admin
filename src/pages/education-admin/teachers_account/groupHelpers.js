import { formatTime } from "@/utils/format";
import { isSameLocalDay, lessonStatus } from "./utils";

export const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
export const WEEKDAY_FULL = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

export function formatRuleTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : String(value);
}

export function getWeekBounds(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function buildScheduleSummary(rules = []) {
  const active = rules.filter((row) => row.is_active !== false);
  if (!active.length) return { days: "—", time: "—", label: "—", weekdays: [] };

  const weekdays = [...new Set(active.map((row) => row.weekday))].sort((a, b) => a - b);
  const days = weekdays.map((day) => WEEKDAY_SHORT[day]).join(" · ");
  const slot = active[0];
  const time = `${formatRuleTime(slot.starts_at)}–${formatRuleTime(slot.ends_at)}`;
  return { days, time, label: `${days} · ${time}`, weekdays };
}

export function reviewPendingCount(row) {
  return Math.max(0, Number(row.submitted_count || 0) - Number(row.graded_count || 0));
}

export function findNextLesson(lessons, groupId) {
  const now = Date.now();
  return (
    lessons
      .filter((row) => String(row.group) === String(groupId))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .find((row) => new Date(row.ends_at).getTime() >= now) || null
  );
}

export function formatNextLessonLabel(lesson) {
  if (!lesson) return null;
  const when = isSameLocalDay(lesson.starts_at) ? "Сегодня" : formatDateShort(lesson.starts_at);
  return `${when} · ${formatTime(lesson.starts_at)}–${formatTime(lesson.ends_at)}`;
}

export function formatDateShort(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (isSameLocalDay(iso)) return "Сегодня";
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  ) {
    return "Завтра";
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function computeGroupAttendancePct(lessons, attendanceByLesson, groupId) {
  const now = Date.now();
  let present = 0;
  let total = 0;
  lessons
    .filter((row) => String(row.group) === String(groupId) && new Date(row.starts_at).getTime() < now)
    .forEach((lesson) => {
      const marks = attendanceByLesson[lesson.id] || [];
      if (!marks.length) return;
      total += marks.length;
      present += marks.filter((row) => ["present", "late", "excused"].includes(row.status)).length;
    });
  return total ? Math.round((present / total) * 100) : null;
}

export function computeStudentAttendancePct(studentId, lessons, attendanceByLesson, groupId) {
  const now = Date.now();
  let present = 0;
  let total = 0;
  lessons
    .filter((row) => String(row.group) === String(groupId) && new Date(row.starts_at).getTime() < now)
    .forEach((lesson) => {
      const mark = (attendanceByLesson[lesson.id] || []).find(
        (row) => String(row.student) === String(studentId),
      );
      if (!mark) return;
      total += 1;
      if (["present", "late", "excused"].includes(mark.status)) present += 1;
    });
  return total ? Math.round((present / total) * 100) : null;
}

export function buildLessonAttendanceSummary(lesson, attendanceRecords = [], expected = 0) {
  const present = attendanceRecords.filter((row) => row.status === "present").length;
  const late = attendanceRecords.filter((row) => row.status === "late").length;
  const absent = attendanceRecords.filter((row) => row.status === "absent").length;
  const excused = attendanceRecords.filter((row) => row.status === "excused").length;
  const attended = present + late + excused;
  const status = lessonStatus(lesson, attendanceRecords.length, expected);
  return { present, late, absent, excused, attended, expected, status };
}

export function groupAttentionItems(groupRow) {
  const items = [];
  if (groupRow.pendingReviews > 0) {
    items.push(`${groupRow.pendingReviews} работ на проверку`);
  } else if (groupRow.unmarkedToday > 0) {
    items.push("Сегодня не отмечена посещаемость");
  } else if (groupRow.missingSubmissions > 0) {
    items.push(`${groupRow.missingSubmissions} работ не сданы`);
  } else if (groupRow.attendancePct != null && groupRow.attendancePct < 75) {
    items.push(`Посещаемость ${groupRow.attendancePct}%`);
  }
  return items.slice(0, 1);
}

export function pickDefaultGroupId(rows = []) {
  if (!rows.length) return null;
  const todayLesson = rows.find((row) => row.nextLessonToday);
  if (todayLesson) return todayLesson.id;
  const withNext = rows
    .filter((row) => row.nextLesson)
    .sort((a, b) => new Date(a.nextLesson.starts_at) - new Date(b.nextLesson.starts_at));
  if (withNext.length) return withNext[0].id;
  const active = rows.find((row) => row.status === "active");
  return active?.id ?? rows[0].id;
}

export function needsAttendanceAction(groupRow) {
  return Boolean(groupRow?.unmarkedToday > 0);
}

export function getStudentStatus({ attendancePct, missingCount, totalAssignments, studentStatus }) {
  if (studentStatus && studentStatus !== "active") {
    return { label: "Неактивен", tone: "muted" };
  }
  if (attendancePct != null && attendancePct < 75) {
    return { label: "Низкая посещаемость", tone: "warn" };
  }
  if (totalAssignments > 0 && missingCount > 0) {
    return { label: "Есть несданные задания", tone: "warn" };
  }
  return { label: "Активен", tone: "green" };
}

export function getAttendanceTone(pct) {
  if (pct == null) return "neutral";
  if (pct >= 85) return "good";
  if (pct >= 75) return "ok";
  return "low";
}

export function studentInitials(student) {
  const name = student?.full_name || student?.name || "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.charAt(0).toUpperCase();
}

export function avatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const palette = ["#1d4ed8", "#0f766e", "#7c3aed", "#0369a1", "#b45309"];
  return palette[Math.abs(hash) % palette.length];
}

export function buildStudentAttendanceStats(studentId, lessons, attendanceByLesson, groupId) {
  const pct = computeStudentAttendancePct(studentId, lessons, attendanceByLesson, groupId);
  const recent = [];
  let present = 0;
  let absent = 0;
  let late = 0;

  lessons
    .filter((row) => String(row.group) === String(groupId) && new Date(row.starts_at) < new Date())
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    .slice(0, 8)
    .forEach((lesson) => {
      const mark = (attendanceByLesson[lesson.id] || []).find(
        (row) => String(row.student) === String(studentId),
      );
      if (!mark) return;
      if (mark.status === "present") present += 1;
      if (mark.status === "absent") absent += 1;
      if (mark.status === "late") late += 1;
      recent.push({ date: lesson.starts_at, status: mark.status });
    });

  return { pct, present, absent, late, recent };
}

export function studentNeedsAttention({ attendancePct, missingCount, pendingReview, studentStatus }) {
  if (studentStatus && studentStatus !== "active") {
    return { needs: false, reasons: [] };
  }
  const reasons = [];
  if (attendancePct != null && attendancePct < 75) {
    reasons.push(`Посещаемость ${attendancePct}%`);
  }
  if (missingCount > 0) {
    const word = missingCount === 1 ? "задание не сдано" : "задания не сданы";
    reasons.push(`${missingCount} ${word}`);
  }
  if (pendingReview > 0) {
    reasons.push(`${pendingReview} на проверку`);
  }
  return { needs: reasons.length > 0, reasons };
}

export function computeLastActivity({ submissions = [], lessons = [], attendanceByLesson = {}, groupId, studentId }) {
  const dates = [];
  submissions.forEach((row) => {
    if (row.submitted_at) dates.push(new Date(row.submitted_at).getTime());
    if (row.graded_at) dates.push(new Date(row.graded_at).getTime());
    if (row.updated_at) dates.push(new Date(row.updated_at).getTime());
  });
  lessons
    .filter((row) => String(row.group) === String(groupId))
    .forEach((lesson) => {
      const mark = (attendanceByLesson[lesson.id] || []).find(
        (row) => String(row.student) === String(studentId),
      );
      if (mark) dates.push(new Date(lesson.starts_at).getTime());
    });
  if (!dates.length) return null;
  return new Date(Math.max(...dates));
}

export function formatLastActivityLabel(date, submissions = []) {
  if (!date) return null;
  const latestSub = submissions
    .filter((row) => row.submitted_at || row.graded_at)
    .sort((a, b) => {
      const aDate = new Date(a.graded_at || a.submitted_at).getTime();
      const bDate = new Date(b.graded_at || b.submitted_at).getTime();
      return bDate - aDate;
    })[0];
  const prefix = latestSub?.graded_at ? "Оценка" : latestSub?.submitted_at ? "Задание" : "Занятие";
  return { prefix, dateLabel: formatDateShort(date) };
}

