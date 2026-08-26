import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Banner,
  Button,
  EmptyState,
  Field,
  SearchInput,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { formatWhen } from "@/utils/format";
import { asList } from "./utils";

const CATEGORY_LABELS = {
  announcement: "Объявление",
  schedule: "Расписание",
  attendance: "Посещаемость",
  students: "Ученики",
  system: "Система",
};

const CATEGORY_OPTIONS = [
  ["announcement", "Объявление"],
  ["schedule", "Расписание"],
  ["attendance", "Посещаемость"],
  ["students", "Ученики"],
];

const RECIPIENT_LABELS = {
  group: "Группа",
  students: "Ученики",
  student: "Ученик",
};

const TEMPLATES = [
  {
    id: "homework",
    title: "Домашнее задание",
    message: "Напоминаю выполнить домашнее задание к следующему занятию.",
    category: "students",
  },
  {
    id: "schedule",
    title: "Изменение в расписании",
    message: "Обратите внимание: в расписании есть изменения. Проверьте актуальные занятия.",
    category: "schedule",
  },
  {
    id: "materials",
    title: "Новые материалы",
    message: "Добавлены новые учебные материалы. Откройте раздел «Материалы» в приложении.",
    category: "announcement",
  },
];

function categoryLabel(value) {
  return CATEGORY_LABELS[value] || value || "Объявление";
}

function recipientsLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} получатель`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} получателя`;
  return `${n} получателей`;
}

function isThisWeek(iso) {
  if (!iso) return false;
  const date = new Date(iso);
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function NotificationsSkeleton() {
  return (
    <div className="tn-page" aria-busy="true">
      <div className="tn-skeleton tn-skeleton-head" />
      <div className="tn-summary">
        <div className="tn-skeleton tn-skeleton-stat" />
        <div className="tn-skeleton tn-skeleton-stat" />
        <div className="tn-skeleton tn-skeleton-stat" />
      </div>
      <div className="tn-skeleton tn-skeleton-list" />
    </div>
  );
}

function SendSheet({
  open,
  onClose,
  onSent,
  groups,
  students,
  enrollments,
  initialGroupId = "",
}) {
  const [mode, setMode] = useState("group");
  const [groupId, setGroupId] = useState(initialGroupId || "");
  const [selectedIds, setSelectedIds] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("announcement");
  const [sendPush, setSendPush] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("group");
    setGroupId(initialGroupId || (groups[0]?.id ? String(groups[0].id) : ""));
    setSelectedIds([]);
    setStudentSearch("");
    setTitle("");
    setMessage("");
    setCategory("announcement");
    setSendPush(true);
    setError("");
  }, [open, initialGroupId, groups]);

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((row) => [String(row.id), row])),
    [groups],
  );

  const studentsInScope = useMemo(() => {
    const allowedGroups = new Set(groups.map((row) => String(row.id)));
    const byStudent = new Map();
    enrollments
      .filter((row) => row.status === "active" && allowedGroups.has(String(row.group)))
      .forEach((row) => {
        const key = String(row.student);
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(String(row.group));
      });
    return students
      .filter((row) => byStudent.has(String(row.id)))
      .map((row) => ({
        ...row,
        groupIds: byStudent.get(String(row.id)) || [],
      }));
  }, [students, enrollments, groups]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return studentsInScope.filter((row) => {
      if (groupId && !row.groupIds.includes(String(groupId))) return false;
      if (!q) return true;
      return (row.full_name || "").toLowerCase().includes(q);
    });
  }, [studentsInScope, studentSearch, groupId]);

  const recipientCount = useMemo(() => {
    if (mode === "group" && groupId) {
      return enrollments.filter(
        (row) => row.status === "active" && String(row.group) === String(groupId),
      ).length;
    }
    if (mode === "students") return selectedIds.length;
    return 0;
  }, [mode, groupId, selectedIds, enrollments]);

  function applyTemplate(template) {
    setTitle(template.title);
    setMessage(template.message);
    setCategory(template.category);
  }

  function toggleStudent(id) {
    const key = String(id);
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError("Укажите заголовок и текст сообщения");
      return;
    }
    if (recipientCount <= 0) {
      setError("Выберите получателей");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim(),
      message: message.trim(),
      category,
      priority: "normal",
      send_push: sendPush,
    };
    if (mode === "group") {
      payload.recipient_type = "group";
      payload.group_id = groupId;
    } else {
      payload.recipient_type = "students";
      payload.student_ids = selectedIds;
    }
    try {
      await api.post("/notifications/send", payload);
      onSent?.(recipientCount);
      onClose();
    } catch (err) {
      setError(err.message || "Не удалось отправить уведомление");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="tn-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tn-send-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tn-sheet-head">
          <div>
            <h2 id="tn-send-title">Отправить уведомление</h2>
            <p className="muted">Сообщение увидят ученики ваших групп</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <form className="tn-sheet-body" onSubmit={submit}>
          {error ? <Banner>{error}</Banner> : null}

          <div className="tn-templates">
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tn-template"
                onClick={() => applyTemplate(item)}
              >
                {item.title}
              </button>
            ))}
          </div>

          <div className="tn-mode-tabs" role="tablist" aria-label="Тип получателей">
            <button
              type="button"
              className={mode === "group" ? "is-active" : ""}
              onClick={() => setMode("group")}
            >
              Группа
            </button>
            <button
              type="button"
              className={mode === "students" ? "is-active" : ""}
              onClick={() => setMode("students")}
            >
              Ученики
            </button>
          </div>

          {mode === "group" ? (
            <Field label="Группа">
              <select
                required
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Выберите группу</option>
                {groups.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.active_students != null ? ` · ${row.active_students}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="tn-students-picker">
              <Field label="Фильтр по группе">
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Все мои группы</option>
                  {groups.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <SearchInput
                value={studentSearch}
                onChange={setStudentSearch}
                placeholder="Найти ученика…"
              />
              <div className="tn-students-list" role="listbox" aria-label="Ученики">
                {filteredStudents.length ? (
                  filteredStudents.map((row) => {
                    const checked = selectedIds.includes(String(row.id));
                    const groupNames = row.groupIds
                      .map((id) => groupMap[id]?.name)
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <label key={row.id} className={`tn-student-row ${checked ? "is-checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(row.id)}
                        />
                        <span>
                          <strong>{row.full_name || "Ученик"}</strong>
                          {groupNames ? <span className="muted">{groupNames}</span> : null}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="muted">Нет учеников по фильтру</p>
                )}
              </div>
              <div className="tn-picker-actions">
                <button
                  type="button"
                  className="tn-text-btn"
                  onClick={() => setSelectedIds(filteredStudents.map((row) => String(row.id)))}
                >
                  Выбрать видимых
                </button>
                <button
                  type="button"
                  className="tn-text-btn"
                  onClick={() => setSelectedIds([])}
                >
                  Сбросить
                </button>
              </div>
            </div>
          )}

          <Field label="Категория">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Заголовок">
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Краткий заголовок"
            />
          </Field>
          <Field label="Сообщение">
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Текст для учеников"
            />
          </Field>
          <label className="tn-check">
            <input
              type="checkbox"
              checked={sendPush}
              onChange={(e) => setSendPush(e.target.checked)}
            />
            <span>Отправить push-уведомление</span>
          </label>

          <div className="tn-sheet-foot">
            <p className="muted">{recipientsLabel(recipientCount)}</p>
            <div className="tn-sheet-actions">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving || recipientCount <= 0}>
                {saving ? "Отправка…" : "Отправить"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DetailDrawer({ item, groupName, onClose }) {
  if (!item) return null;
  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="tn-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tn-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tn-detail-head">
          <div>
            <p className="tn-card-label">{categoryLabel(item.category)}</p>
            <h2 id="tn-detail-title">{item.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="tn-detail-body">
          <p className="tn-detail-message">{item.message}</p>
          <dl className="tn-dl">
            <div>
              <dt>Когда</dt>
              <dd>{formatWhen(item.created_at)}</dd>
            </div>
            <div>
              <dt>Кому</dt>
              <dd>
                {RECIPIENT_LABELS[item.recipient_type] || item.recipient_type}
                {groupName ? ` · ${groupName}` : ""}
              </dd>
            </div>
            <div>
              <dt>Получатели</dt>
              <dd>{recipientsLabel(item.recipients_count)}</dd>
            </div>
            <div>
              <dt>Прочитано</dt>
              <dd>
                {Number(item.read_count || 0)} из {Number(item.recipients_count || 0)}
              </dd>
            </div>
            <div>
              <dt>Push</dt>
              <dd>{item.send_push ? "Да" : "Нет"}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export default function TeacherNotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGroup = searchParams.get("group") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sent, setSent] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [sendOpen, setSendOpen] = useState(Boolean(initialGroup));
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState(initialGroup);
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sentRows, groupRows, studentRows, enrollmentRows] = await Promise.all([
        asList("/notifications/sent?page_size=100"),
        asList("/groups?page_size=100"),
        asList("/students?page_size=500"),
        asList("/enrollments?page_size=500"),
      ]);
      setSent(sentRows);
      setGroups(groupRows);
      setStudents(studentRows);
      setEnrollments(enrollmentRows);
    } catch (err) {
      setError(err.message || "Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const groupNameById = useMemo(
    () => Object.fromEntries(groups.map((row) => [String(row.id), row.name])),
    [groups],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sent.filter((row) => {
      if (groupFilter && String(row.group) !== String(groupFilter)) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (row.title || "").toLowerCase().includes(q) ||
        (row.message || "").toLowerCase().includes(q)
      );
    });
  }, [sent, query, groupFilter, categoryFilter]);

  const stats = useMemo(() => {
    const week = sent.filter((row) => isThisWeek(row.created_at));
    const recipients = sent.reduce((sum, row) => sum + Number(row.recipients_count || 0), 0);
    const read = sent.reduce((sum, row) => sum + Number(row.read_count || 0), 0);
    return {
      total: sent.length,
      week: week.length,
      recipients,
      read,
    };
  }, [sent]);

  function openSend(groupId = "") {
    if (groupId) {
      setGroupFilter(groupId);
      setSearchParams({ group: groupId });
    }
    setSendOpen(true);
  }

  function closeSend() {
    setSendOpen(false);
    if (searchParams.get("group")) {
      setSearchParams({});
    }
  }

  if (loading) return <NotificationsSkeleton />;

  return (
    <div className="tn-page">
      <header className="tn-page-head">
        <div>
          <h1>Уведомления</h1>
          <p className="muted">Сообщения для ваших групп и учеников</p>
        </div>
        <Button type="button" onClick={() => openSend(groupFilter)}>
          Отправить
        </Button>
      </header>

      {error ? <Banner>{error}</Banner> : null}
      {toast ? (
        <Banner tone="ok" role="status">
          {toast}
        </Banner>
      ) : null}

      <section className="tn-summary" aria-label="Сводка">
        <div className="tn-stat">
          <span className="muted">Всего отправлено</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="tn-stat">
          <span className="muted">На этой неделе</span>
          <strong>{stats.week}</strong>
        </div>
        <div className="tn-stat">
          <span className="muted">Получателей</span>
          <strong>{stats.recipients}</strong>
        </div>
        <div className="tn-stat">
          <span className="muted">Прочитано</span>
          <strong>{stats.read}</strong>
        </div>
      </section>

      <section className="tn-toolbar card">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Поиск по заголовку или тексту…"
        />
        <label className="tn-filter">
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label="Фильтр по группе"
          >
            <option value="">Все группы</option>
            {groups.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tn-filter">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Фильтр по категории"
          >
            <option value="">Все категории</option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {filtered.length ? (
        <ul className="tn-feed">
          {filtered.map((row) => {
            const groupName = groupNameById[String(row.group)] || "";
            const read = Number(row.read_count || 0);
            const total = Number(row.recipients_count || 0);
            const readPct = total ? Math.round((read / total) * 100) : 0;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="tn-card card"
                  onClick={() => setSelected(row)}
                >
                  <div className="tn-card-top">
                    <span className="tn-badge">{categoryLabel(row.category)}</span>
                    <time className="muted" dateTime={row.created_at}>
                      {formatWhen(row.created_at)}
                    </time>
                  </div>
                  <h3>{row.title}</h3>
                  <p className="tn-card-preview">{row.message}</p>
                  <div className="tn-card-meta">
                    <span>
                      {RECIPIENT_LABELS[row.recipient_type] || "Получатели"}
                      {groupName ? ` · ${groupName}` : ""}
                    </span>
                    <span>{recipientsLabel(total)}</span>
                    <span>
                      Прочитано {read}/{total}
                      {total ? ` · ${readPct}%` : ""}
                    </span>
                    {row.send_push ? <span className="tn-push">Push</span> : null}
                  </div>
                  {total ? (
                    <span className="tn-read-bar" aria-hidden="true">
                      <span style={{ width: `${readPct}%` }} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={sent.length ? "Ничего не найдено" : "Пока нет отправленных сообщений"}
          body={
            sent.length
              ? "Измените фильтры или поисковый запрос."
              : "Отправьте объявление группе или отдельным ученикам."
          }
          action={
            <Button type="button" onClick={() => openSend(groupFilter)}>
              Отправить уведомление
            </Button>
          }
        />
      )}

      <SendSheet
        open={sendOpen}
        onClose={closeSend}
        groups={groups}
        students={students}
        enrollments={enrollments}
        initialGroupId={groupFilter || initialGroup}
        onSent={(count) => {
          setToast(`Отправлено: ${recipientsLabel(count)}`);
          load();
        }}
      />

      <DetailDrawer
        item={selected}
        groupName={selected ? groupNameById[String(selected.group)] || "" : ""}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
