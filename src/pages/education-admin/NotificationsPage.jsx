import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Button, Field, PageHeader } from "@/components/ui";
import { api, getSession } from "@/services/api/client";
import { formatDate, formatTime, formatWhen, money, results, today } from "@/utils/format";

import NotificationsSendSheet from "./NotificationsSendSheet";

const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "announcement", label: "Объявления" },
  { value: "payment", label: "Платежи" },
  { value: "attendance", label: "Посещаемость" },
  { value: "crm", label: "CRM" },
  { value: "schedule", label: "Расписание" },
  { value: "students", label: "Ученики" },
  { value: "staff", label: "Сотрудники" },
  { value: "system", label: "Система" },
];

const TYPE_META = {
  announcement: { label: "Объявления", icon: "✉", tone: "blue" },
  payment: { label: "Платежи", icon: "сум", tone: "green" },
  attendance: { label: "Посещаемость", icon: "✓", tone: "blue" },
  crm: { label: "CRM", icon: "◎", tone: "purple" },
  schedule: { label: "Расписание", icon: "◷", tone: "blue" },
  students: { label: "Ученики", icon: "S", tone: "green" },
  staff: { label: "Сотрудники", icon: "T", tone: "purple" },
  system: { label: "Система", icon: "!", tone: "orange" },
};

const PRIORITY_LABELS = {
  normal: "Обычное",
  important: "Важное",
  critical: "Критическое",
};

function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function daysAgo(n) {
  return addDays(today(), -n);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function invoiceBalance(invoice) {
  return Math.max(0, asNumber(invoice.amount) - asNumber(invoice.paid_amount));
}

function isOpenInvoice(invoice) {
  return !["void", "draft", "paid"].includes(invoice.status) && invoiceBalance(invoice) > 0;
}

function isOverdueInvoice(invoice, now = new Date()) {
  if (!isOpenInvoice(invoice)) return false;
  if (invoice.status === "overdue") return true;
  return new Date(invoice.due_at) < now;
}

function expectedStudents(groupId, enrollments) {
  return enrollments.filter(
    (item) => String(item.group) === String(groupId) && item.status === "active",
  ).length;
}

function lessonAttendanceStats(records, expected) {
  const marked = records.length;
  if (expected <= 0) return "marked";
  if (marked >= expected) return "marked";
  if (marked > 0) return "partial";
  return "unmarked";
}

function readStorageKey() {
  const tenantId = getSession().tenantId || "default";
  return `yagona-notifications-read:${tenantId}`;
}

function loadReadIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(readStorageKey()) || "[]"));
  } catch {
    return new Set();
  }
}

function saveReadIds(set) {
  localStorage.setItem(readStorageKey(), JSON.stringify([...set]));
}

async function fetchAll(path) {
  const items = [];
  let url = path.includes("?") ? `${path}&page_size=200` : `${path}?page_size=200`;
  while (url) {
    const data = await api.get(url);
    items.push(...results(data));
    if (!data.next) break;
    try {
      const next = new URL(data.next, window.location.origin);
      url = `${next.pathname.replace(/^\/api\/v1/, "")}${next.search}`;
    } catch {
      break;
    }
  }
  return items;
}

async function loadAttendanceForLessons(lessons) {
  const cache = new Map();
  await Promise.all(
    lessons.map(async (lesson) => {
      try {
        const data = await api.get(`/lessons/${lesson.id}/attendance`);
        cache.set(String(lesson.id), Array.isArray(data) ? data : results(data));
      } catch {
        cache.set(String(lesson.id), []);
      }
    }),
  );
  return cache;
}

function timeGroupLabel(value) {
  const day = isoDate(value);
  const nowDay = today();
  if (day === nowDay) return "Сегодня";
  if (day === addDays(nowDay, -1)) return "Вчера";
  const weekStart = addDays(nowDay, -6);
  if (day >= weekStart) return "На этой неделе";
  return "Ранее";
}

function buildNotifications({
  base,
  invoices,
  payments,
  students,
  leads,
  leadStages,
  lessons,
  groups,
  enrollments,
  outbox,
  staff,
  salaryRecords,
  attendanceCache,
}) {
  const now = new Date();
  const studentMap = Object.fromEntries(students.map((item) => [String(item.id), item]));
  const groupMap = Object.fromEntries(groups.map((item) => [String(item.id), item]));
  const stageMap = Object.fromEntries(leadStages.map((item) => [String(item.id), item]));
  const firstStageId = [...leadStages].sort((a, b) => a.position - b.position)[0]?.id;
  const staffMap = Object.fromEntries(staff.map((item) => [String(item.id), item]));
  const items = [];

  invoices
    .filter((invoice) => isOverdueInvoice(invoice, now))
    .forEach((invoice) => {
      const student = studentMap[String(invoice.student)];
      const balance = invoiceBalance(invoice);
      items.push({
        id: `payment-overdue-${invoice.id}`,
        type: "payment",
        priority: "critical",
        attention: true,
        title: "У ученика задолженность",
        description: `${student?.full_name || "Ученик"} — долг ${money(balance, invoice.currency)}`,
        occurredAt: invoice.due_at || invoice.updated_at || invoice.created_at,
        actionLabel: "Открыть биллинг",
        actionTo: `${base}/billing`,
      });
    });

  invoices
    .filter((item) => isOpenInvoice(item) && isoDate(item.due_at) === today())
    .forEach((invoice) => {
      const student = studentMap[String(invoice.student)];
      items.push({
        id: `payment-due-today-${invoice.id}`,
        type: "payment",
        priority: "important",
        attention: true,
        title: "Оплата ожидается сегодня",
        description: `${student?.full_name || "Ученик"} — ${money(invoiceBalance(invoice), invoice.currency)}`,
        occurredAt: invoice.due_at || invoice.created_at,
        actionLabel: "Открыть биллинг",
        actionTo: `${base}/billing`,
      });
    });

  payments
    .filter((item) => item.status === "failed" && isoDate(item.paid_at) >= daysAgo(30))
    .forEach((payment) => {
      items.push({
        id: `payment-failed-${payment.id}`,
        type: "payment",
        priority: "critical",
        attention: true,
        title: "Неудачный платёж",
        description: `${money(payment.amount, payment.currency || "UZS")} · ${formatWhen(payment.paid_at)}`,
        occurredAt: payment.paid_at || payment.created_at,
        actionLabel: "Открыть биллинг",
        actionTo: `${base}/billing`,
      });
    });

  const pastLessons = lessons.filter((lesson) => new Date(lesson.ends_at) < now);
  pastLessons.forEach((lesson) => {
    if (isoDate(lesson.starts_at) < daysAgo(14)) return;
    const expected = expectedStudents(lesson.group, enrollments);
    const records = attendanceCache.get(String(lesson.id)) || [];
    const markStatus = lessonAttendanceStats(records, expected);
    if (markStatus === "marked") return;
    const group = groupMap[String(lesson.group)];
    const time = `${formatTime(lesson.starts_at)}–${formatTime(lesson.ends_at)}`;
    items.push({
      id: `attendance-${lesson.id}`,
      type: "attendance",
      priority: markStatus === "unmarked" ? "important" : "normal",
      attention: markStatus === "unmarked",
      title: "Посещаемость не отмечена",
      description: `${group?.name || "Группа"}, занятие ${time}`,
      occurredAt: lesson.ends_at || lesson.starts_at,
      actionLabel: "Открыть посещаемость",
      actionTo: `${base}/attendance`,
    });
  });

  leads
    .filter((lead) => !lead.converted_student && isoDate(lead.created_at) >= daysAgo(14))
    .forEach((lead) => {
      const stage = stageMap[String(lead.stage)];
      if (stage?.is_won || stage?.is_lost) return;
      const isNew = firstStageId && String(lead.stage) === String(firstStageId);
      items.push({
        id: `crm-lead-${lead.id}`,
        type: "crm",
        priority: isNew ? "important" : "normal",
        attention: isNew,
        title: isNew ? "Новая заявка в CRM" : "Активный лид в CRM",
        description: `${lead.full_name}${lead.phone ? ` · ${lead.phone}` : ""}`,
        occurredAt: lead.created_at,
        actionLabel: "Открыть CRM",
        actionTo: `${base}/crm`,
      });
    });

  lessons.forEach((lesson) => {
    if (lesson.status === "cancelled" && isoDate(lesson.updated_at || lesson.created_at) >= daysAgo(14)) {
      const group = groupMap[String(lesson.group)];
      items.push({
        id: `schedule-cancel-${lesson.id}`,
        type: "schedule",
        priority: "important",
        attention: true,
        title: "Занятие отменено",
        description: `${group?.name || "Группа"} · ${formatWhen(lesson.starts_at)}`,
        occurredAt: lesson.updated_at || lesson.created_at,
        actionLabel: "Открыть расписание",
        actionTo: `${base}/schedule`,
      });
      return;
    }
    const created = new Date(lesson.created_at).getTime();
    const updated = new Date(lesson.updated_at || lesson.created_at).getTime();
    if (
      updated - created > 60_000 &&
      isoDate(lesson.updated_at) >= daysAgo(7) &&
      lesson.status !== "cancelled"
    ) {
      const group = groupMap[String(lesson.group)];
      items.push({
        id: `schedule-update-${lesson.id}-${lesson.updated_at}`,
        type: "schedule",
        priority: "normal",
        attention: false,
        title: "Изменение расписания",
        description: `${group?.name || "Группа"} · ${formatWhen(lesson.starts_at)}`,
        occurredAt: lesson.updated_at,
        actionLabel: "Открыть расписание",
        actionTo: `${base}/schedule`,
      });
    }
  });

  students
    .filter((item) => isoDate(item.created_at) >= daysAgo(14))
    .forEach((student) => {
      items.push({
        id: `student-new-${student.id}`,
        type: "students",
        priority: "normal",
        attention: false,
        title: "Новый ученик",
        description: student.full_name || "Без имени",
        occurredAt: student.created_at,
        actionLabel: "Открыть учеников",
        actionTo: `${base}/students`,
      });
    });

  salaryRecords
    .filter((record) => record.status === "unpaid" && asNumber(record.accrued_amount) > 0)
    .forEach((record) => {
      const member = staffMap[String(record.membership)];
      const user = member?.user || {};
      const name =
        user.name ||
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.email ||
        "Сотрудник";
      items.push({
        id: `staff-salary-${record.id}`,
        type: "staff",
        priority: "important",
        attention: true,
        title: "Зарплата не выплачена",
        description: `${name} — ${money(record.accrued_amount, "UZS")}`,
        occurredAt: record.period || record.created_at,
        actionLabel: "Открыть финансы",
        actionTo: `${base}/finance`,
      });
    });

  staff
    .filter((item) => !item.is_active && isoDate(item.updated_at || item.created_at) >= daysAgo(30))
    .forEach((member) => {
      const user = member.user || {};
      const name =
        user.name ||
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.email ||
        "Сотрудник";
      items.push({
        id: `staff-inactive-${member.id}`,
        type: "staff",
        priority: "normal",
        attention: false,
        title: "Сотрудник деактивирован",
        description: name,
        occurredAt: member.updated_at || member.created_at,
        actionLabel: "Открыть команду",
        actionTo: `${base}/staff`,
      });
    });

  outbox
    .filter((item) => item.status === "failed")
    .forEach((item) => {
      items.push({
        id: `system-outbox-${item.id}`,
        type: "system",
        priority: "critical",
        attention: true,
        title: "Ошибка отправки уведомления",
        description: item.last_error || item.rendered_body?.slice(0, 120) || "Сбой доставки",
        occurredAt: item.updated_at || item.created_at,
        actionLabel: "Настройки",
        actionTo: `${base}/notifications`,
      });
    });

  outbox
    .filter((item) => item.status === "sent" && isoDate(item.sent_at || item.created_at) >= daysAgo(7))
    .slice(0, 20)
    .forEach((item) => {
      items.push({
        id: `system-sent-${item.id}`,
        type: "system",
        priority: "normal",
        attention: false,
        title: "Сообщение отправлено",
        description: item.rendered_body?.slice(0, 120) || "Telegram / SMS",
        occurredAt: item.sent_at || item.created_at,
        actionLabel: null,
        actionTo: null,
      });
    });

  return items.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

const RECIPIENT_TYPE_LABELS = {
  student: "Один ученик",
  students: "Несколько учеников",
  group: "Группа",
  course: "Курс",
  all_students: "Все ученики",
};

export default function NotificationsPage() {
  const slug = getSession().tenantSlug;
  const session = getSession();
  const tenantName =
    session.memberships?.find((item) => item.tenant_slug === slug)?.tenant_name || slug || "";
  const base = slug ? `/education/${slug}` : "..";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [sentItems, setSentItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadIds());
  const [pageTab, setPageTab] = useState("incoming");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedSent, setSelectedSent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const period = `${today().slice(0, 8)}01`;
      const [
        invoices,
        payments,
        studentsData,
        leads,
        leadStages,
        lessons,
        groupsData,
        coursesData,
        enrollmentsData,
        outbox,
        staff,
        salaryRecords,
        sentData,
      ] = await Promise.all([
        fetchAll("/invoices"),
        fetchAll("/payments"),
        fetchAll("/students"),
        fetchAll("/leads"),
        fetchAll("/lead-stages"),
        fetchAll("/lessons"),
        fetchAll("/groups"),
        fetchAll("/courses"),
        fetchAll("/enrollments"),
        fetchAll("/notification-outbox").catch(() => []),
        fetchAll("/staff"),
        fetchAll(`/salary-records?period=${period}`).catch(() => []),
        fetchAll("/notifications/sent").catch(() => []),
      ]);

      setStudents(studentsData);
      setGroups(groupsData);
      setCourses(coursesData);
      setEnrollments(enrollmentsData);
      setSentItems(sentData);

      const now = new Date();
      const attendanceLessons = lessons
        .filter((lesson) => new Date(lesson.ends_at) < now && isoDate(lesson.starts_at) >= daysAgo(14))
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
        .slice(0, 30);

      const attendanceCache = await loadAttendanceForLessons(attendanceLessons);

      setNotifications(
        buildNotifications({
          base,
          invoices,
          payments,
          students: studentsData,
          leads,
          leadStages,
          lessons,
          groups: groupsData,
          enrollments: enrollmentsData,
          outbox,
          staff,
          salaryRecords,
          attendanceCache,
        }),
      );
    } catch (err) {
      setError(err.message || "Не удалось загрузить уведомления.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const enriched = useMemo(
    () =>
      notifications.map((item) => ({
        ...item,
        read: readIds.has(item.id),
      })),
    [notifications, readIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const weekStart = daysAgo(6);
    let source = enriched;
    if (pageTab === "attention") {
      source = enriched.filter((item) => item.attention);
    }
    return source.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (statusFilter === "unread" && item.read) return false;
      if (statusFilter === "read" && !item.read) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      const day = isoDate(item.occurredAt);
      if (periodFilter === "today" && day !== today()) return false;
      if (periodFilter === "week" && day < weekStart) return false;
      if (periodFilter === "month" && day < daysAgo(29)) return false;
      if (q && !`${item.title} ${item.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, pageTab, typeFilter, statusFilter, priorityFilter, periodFilter, search]);

  const filteredSent = useMemo(() => {
    const q = search.trim().toLowerCase();
    const weekStart = daysAgo(6);
    return sentItems.filter((item) => {
      const day = isoDate(item.created_at);
      if (periodFilter === "today" && day !== today()) return false;
      if (periodFilter === "week" && day < weekStart) return false;
      if (periodFilter === "month" && day < daysAgo(29)) return false;
      if (typeFilter && item.category !== typeFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      if (q && !`${item.title} ${item.message}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sentItems, search, periodFilter, typeFilter, priorityFilter]);

  const stats = useMemo(() => {
    const unread = enriched.filter((item) => !item.read).length;
    const attention = enriched.filter((item) => item.attention && !item.read).length;
    const todayCount = enriched.filter((item) => isoDate(item.occurredAt) === today()).length;
    const sentWeekCount = sentItems.filter((item) => isoDate(item.created_at) >= daysAgo(6)).length;
    return { unread, attention, todayCount, sentWeekCount };
  }, [enriched, sentItems]);

  const attentionItems = useMemo(
    () => enriched.filter((item) => item.attention).slice(0, 8),
    [enriched],
  );

  const grouped = useMemo(() => {
    const order = ["Сегодня", "Вчера", "На этой неделе", "Ранее"];
    const map = new Map(order.map((label) => [label, []]));
    filtered.forEach((item) => {
      const label = timeGroupLabel(item.occurredAt);
      map.get(label).push(item);
    });
    return order
      .map((label) => ({ label, items: map.get(label) }))
      .filter((group) => group.items.length);
  }, [filtered]);

  function markRead(id) {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    saveReadIds(next);
  }

  function markAllRead() {
    const next = new Set(enriched.map((item) => item.id));
    setReadIds(next);
    saveReadIds(next);
  }

  async function openSentDetail(item) {
    setSelectedSent({ ...item, loading: true });
    try {
      const detail = await api.get(`/notifications/sent/${item.id}`);
      setSelectedSent(detail);
    } catch (err) {
      setSelectedSent({ ...item, detailError: err.message || "Не удалось загрузить детали." });
    }
  }

  function handleSent(count) {
    setInfo(`Уведомление отправлено ${count} ученикам`);
    load();
    setPageTab("sent");
    window.setTimeout(() => setInfo(""), 4000);
  }

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((item) => [String(item.id), item])),
    [groups],
  );
  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((item) => [String(item.id), item])),
    [courses],
  );

  function sentRecipientLabel(item) {
    if (item.recipient_type === "group" && item.group) {
      return groupMap[String(item.group)]?.name || "Группа";
    }
    if (item.recipient_type === "course" && item.course) {
      return courseMap[String(item.course)]?.name || "Курс";
    }
    return RECIPIENT_TYPE_LABELS[item.recipient_type] || item.recipient_type;
  }

  return (
    <div className="notifications-page">
      <PageHeader
        title="Уведомления"
        subtitle="Важные события и сообщения учебного центра"
        actions={
          <div className="notifications-topbar">
            <button type="button" className="btn btn-primary" onClick={() => setSendOpen(true)}>
              + Отправить уведомление
            </button>
            {pageTab !== "sent" ? (
              <button type="button" className="btn btn-secondary" onClick={markAllRead}>
                Отметить все прочитанными
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
              Настройки уведомлений
            </button>
          </div>
        }
      />

      <Banner>{error}</Banner>
      {info ? <p className="notifications-info">{info}</p> : null}
      {loading ? <p className="notifications-loading muted">Загрузка…</p> : null}

      <div className="notifications-stats">
        <div className="notifications-stat tone-blue">
          <strong>{stats.unread}</strong>
          <span>Новые</span>
        </div>
        <div className="notifications-stat tone-orange">
          <strong>{stats.attention}</strong>
          <span>Требуют внимания</span>
        </div>
        <div className="notifications-stat tone-green">
          <strong>{stats.todayCount}</strong>
          <span>Сегодня</span>
        </div>
        <div className="notifications-stat tone-purple">
          <strong>{stats.sentWeekCount}</strong>
          <span>Отправлено за неделю</span>
        </div>
      </div>

      <div className="notifications-page-tabs">
        {[
          ["incoming", "Входящие"],
          ["attention", "Требует внимания"],
          ["sent", "Отправленные"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`notifications-page-tab${pageTab === value ? " is-active" : ""}`}
            onClick={() => setPageTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="notifications-filters">
        <Field label="Тип">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {TYPE_OPTIONS.map((item) => (
              <option key={item.value || "all"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        {pageTab !== "sent" ? (
          <Field label="Статус">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="unread">Непрочитанные</option>
              <option value="read">Прочитанные</option>
            </select>
          </Field>
        ) : null}
        <Field label="Приоритет">
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Все</option>
            <option value="normal">Обычные</option>
            <option value="important">Важные</option>
            <option value="critical">Критические</option>
          </select>
        </Field>
        <Field label="Период">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="">Весь период</option>
            <option value="today">Сегодня</option>
            <option value="week">За неделю</option>
            <option value="month">За месяц</option>
          </select>
        </Field>
        <Field label="Поиск">
          <input
            placeholder="Заголовок или описание"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      {pageTab === "sent" ? (
        <div className="notifications-sent-list">
          {!loading && !filteredSent.length ? (
            <div className="card notifications-empty">
              <strong>Нет отправленных уведомлений</strong>
              <p className="muted">Отправьте первое сообщение ученикам.</p>
            </div>
          ) : null}
          {filteredSent.map((item) => {
            const meta = TYPE_META[item.category] || TYPE_META.system;
            return (
              <button
                key={item.id}
                type="button"
                className="notifications-sent-item"
                onClick={() => openSentDetail(item)}
              >
                <div className={`notifications-icon tone-${meta.tone}`}>{meta.icon}</div>
                <div className="notifications-copy">
                  <div className="notifications-copy-head">
                    <strong>{item.title}</strong>
                    <span className={`notifications-priority priority-${item.priority}`}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  </div>
                  <p>{item.message?.slice(0, 120)}</p>
                  <div className="notifications-meta">
                    <span className="notifications-type">{sentRecipientLabel(item)}</span>
                    <span>{item.recipients_count} получателей</span>
                    {item.read_count != null ? <span>Прочитали: {item.read_count}</span> : null}
                    {item.unread_count != null ? <span>Не прочитали: {item.unread_count}</span> : null}
                    <span>{formatWhen(item.created_at)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="notifications-layout">
        <div className="notifications-main">
          {!loading && !filtered.length ? (
            <div className="card notifications-empty">
              <strong>Нет уведомлений</strong>
              <p className="muted">По выбранным фильтрам событий не найдено.</p>
            </div>
          ) : null}

          {grouped.map((group) => (
            <section key={group.label} className="notifications-group">
              <h3>{group.label}</h3>
              <div className="notifications-list">
                {group.items.map((item) => {
                  const meta = TYPE_META[item.type] || TYPE_META.system;
                  return (
                    <article
                      key={item.id}
                      className={`notifications-item${item.read ? " is-read" : " is-unread"} priority-${item.priority}`}
                    >
                      {!item.read ? <span className="notifications-unread-dot" aria-hidden="true" /> : null}
                      <div className={`notifications-icon tone-${meta.tone}`}>{meta.icon}</div>
                      <div className="notifications-copy">
                        <div className="notifications-copy-head">
                          <strong>{item.title}</strong>
                          <span className={`notifications-priority priority-${item.priority}`}>
                            {PRIORITY_LABELS[item.priority]}
                          </span>
                        </div>
                        <p>{item.description}</p>
                        <div className="notifications-meta">
                          <span className="notifications-type">{meta.label}</span>
                          <span>{formatWhen(item.occurredAt)}</span>
                        </div>
                      </div>
                      <div className="notifications-actions">
                        {!item.read ? (
                          <button type="button" className="text-action" onClick={() => markRead(item.id)}>
                            Прочитано
                          </button>
                        ) : null}
                        {item.actionTo && item.actionLabel ? (
                          <Link className="btn btn-secondary btn-sm" to={item.actionTo}>
                            {item.actionLabel}
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {pageTab === "incoming" ? (
          <aside className="notifications-aside card">
            <h3>Требует внимания</h3>
            {!attentionItems.length ? (
              <p className="muted notifications-aside-empty">Сейчас всё в порядке.</p>
            ) : (
              <ul className="notifications-attention-list">
                {attentionItems.map((item) => (
                  <li key={item.id} className={`notifications-attention-item priority-${item.priority}`}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    {item.actionTo ? (
                      <Link to={item.actionTo} onClick={() => markRead(item.id)}>
                        {item.actionLabel}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
      </div>
      )}

      <NotificationsSendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={handleSent}
        tenantName={tenantName}
        students={students}
        groups={groups}
        courses={courses}
        enrollments={enrollments}
      />

      {selectedSent ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Детали уведомления">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setSelectedSent(null)}
          />
          <div className="sheet notifications-sent-detail-sheet">
            <div className="sheet-head">
              <div>
                <h2>{selectedSent.title}</h2>
                <p className="muted">{formatWhen(selectedSent.created_at)}</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                aria-label="Закрыть"
                onClick={() => setSelectedSent(null)}
              >
                ×
              </button>
            </div>
            <div className="sheet-body notifications-sent-detail-body">
              {selectedSent.detailError ? <Banner>{selectedSent.detailError}</Banner> : null}
              {selectedSent.loading ? <p className="muted">Загрузка…</p> : null}
              {!selectedSent.loading ? (
                <>
                  <p>{selectedSent.message}</p>
                  <dl className="notifications-sent-detail-meta">
                    <div>
                      <dt>Категория</dt>
                      <dd>{TYPE_META[selectedSent.category]?.label || selectedSent.category}</dd>
                    </div>
                    <div>
                      <dt>Приоритет</dt>
                      <dd>{PRIORITY_LABELS[selectedSent.priority]}</dd>
                    </div>
                    <div>
                      <dt>Отправитель</dt>
                      <dd>{selectedSent.sender_name || "Учебный центр"}</dd>
                    </div>
                    <div>
                      <dt>Получатели</dt>
                      <dd>
                        {sentRecipientLabel(selectedSent)} · {selectedSent.recipients_count}
                      </dd>
                    </div>
                    <div>
                      <dt>Push</dt>
                      <dd>{selectedSent.send_push ? "Запрошен" : "Нет"}</dd>
                    </div>
                    {selectedSent.read_count != null ? (
                      <div>
                        <dt>Прочитали</dt>
                        <dd>{selectedSent.read_count}</dd>
                      </div>
                    ) : null}
                    {selectedSent.unread_count != null ? (
                      <div>
                        <dt>Не прочитали</dt>
                        <dd>{selectedSent.unread_count}</dd>
                      </div>
                    ) : null}
                    {selectedSent.push_sent_count != null ? (
                      <div>
                        <dt>Push доставлен</dt>
                        <dd>{selectedSent.push_sent_count}</dd>
                      </div>
                    ) : null}
                    {selectedSent.push_failed_count != null && selectedSent.push_failed_count > 0 ? (
                      <div>
                        <dt>Push ошибки</dt>
                        <dd>{selectedSent.push_failed_count}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selectedSent.recipients?.length ? (
                    <div className="notifications-sent-recipients">
                      <h3>Получатели</h3>
                      <ul>
                        {selectedSent.recipients.map((row) => (
                          <li key={row.id}>
                            <strong>{row.student_name}</strong>
                            <span>{row.read ? "Прочитано" : "Не прочитано"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="sheet-foot">
              <Button type="button" onClick={() => setSelectedSent(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Настройки уведомлений">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="sheet notifications-settings-sheet">
            <div className="sheet-head">
              <div>
                <h2>Настройки уведомлений</h2>
                <p className="muted">Источники событий на этой странице</p>
              </div>
              <button type="button" className="sheet-close" aria-label="Закрыть" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="sheet-body notifications-settings-body">
              <p className="muted">
                Сохранение персональных предпочтений по категориям пока не поддерживается API. Центр
                собирает реальные события из биллинга, посещаемости, CRM, расписания, учеников,
                команды и очереди отправки.
              </p>
              <ul className="notifications-settings-list">
                {TYPE_OPTIONS.filter((item) => item.value).map((item) => (
                  <li key={item.value}>
                    <span>{item.label}</span>
                    <span className="notifications-settings-state">Включено</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sheet-foot">
              <Button type="button" onClick={() => setSettingsOpen(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
