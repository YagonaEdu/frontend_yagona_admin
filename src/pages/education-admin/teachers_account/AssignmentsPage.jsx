import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banner, Button, EmptyState, SearchInput } from "@/components/ui";
import { api, invalidateApiCache } from "@/services/api/client";
import { results } from "@/utils/format";
import AssignmentDetailPanel from "./AssignmentDetailPanel";
import CreateAssignmentSheet from "./CreateAssignmentSheet";
import GradeSubmissionSheet from "./GradeSubmissionSheet";
import ReminderConfirmModal from "./ReminderConfirmModal";
import {
  assignmentDueMeta,
  assignmentStatusLabel,
  buildAttentionItems,
  filterAssignmentTab,
  formatDueLabel,
  pendingReviewCount,
  sortAssignments,
} from "./assignmentHelpers";
import { asList } from "./utils";
import { IconUsers, SUMMARY_ICON_MAP } from "./tgIcons";

const TABS = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "review", label: "На проверку" },
  { id: "closed", label: "Завершённые" },
  { id: "draft", label: "Черновики" },
];

function ListSkeleton() {
  return (
    <div className="ta-skeleton">
      {[1, 2, 3, 4, 5].map((key) => (
        <div key={key} className="ta-skeleton-row" />
      ))}
    </div>
  );
}

function AssignmentRow({ row, onOpen, onReview, onMenuAction }) {
  const pending = pendingReviewCount(row);
  const status = assignmentStatusLabel(row);
  const dueHint = assignmentDueMeta(row.due_at, row.status);
  const total = Number(row.total_students || 0);
  const submitted = Number(row.submitted_count || 0);
  const pct = total ? Math.round((submitted / total) * 100) : 0;

  return (
    <article className="ta-row">
      <button type="button" className="ta-row-main" onClick={() => onOpen(row)}>
        <div className="ta-row-head">
          <div>
            <strong>{row.title}</strong>
            <p className="tg-muted">
              {row.groupName}
              {row.courseName ? ` · ${row.courseName}` : ""}
            </p>
          </div>
          <div className="ta-row-badges">
            {dueHint ? <span className={`ta-urgency ta-urgency-${dueHint.tone}`}>{dueHint.label}</span> : null}
            <span className={`tg-pill tg-pill-${statusTone(status.tone)}`}>{status.label}</span>
          </div>
        </div>
        <div className="ta-row-meta">
          <span>Срок: {formatDueLabel(row.due_at)}</span>
          <span>
            Сдали: {submitted} / {total || "—"}
          </span>
          {pending > 0 ? <span className="ta-meta-warn">{pending} на проверку</span> : null}
          {row.missing_count > 0 ? <span className="ta-meta-warn">{row.missing_count} не сдали</span> : null}
        </div>
        <div className="ta-row-progress" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      </button>
      <div className="ta-row-actions">
        {pending > 0 ? (
          <Button onClick={() => onReview(row)}>Проверить {pending}</Button>
        ) : (
          <Button variant="ghost" onClick={() => onOpen(row)}>
            Открыть
          </Button>
        )}
        <div className="ta-menu-wrap">
          <button
            type="button"
            className="ta-menu-btn"
            aria-label="Действия с заданием"
            onClick={(e) => {
              e.stopPropagation();
              onMenuAction(row, "menu");
            }}
          >
            ⋯
          </button>
          <div className="ta-menu">
            <button type="button" onClick={() => onMenuAction(row, "open")}>
              Открыть
            </button>
            <button type="button" onClick={() => onMenuAction(row, "edit")}>
              Редактировать
            </button>
            <button type="button" onClick={() => onMenuAction(row, "duplicate")}>
              Дублировать
            </button>
            {row.status === "published" ? (
              <button type="button" onClick={() => onMenuAction(row, "close")}>
                Завершить
              </button>
            ) : null}
            {row.missing_count > 0 ? (
              <button type="button" onClick={() => onMenuAction(row, "remind")}>
                Напомнить
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function statusTone(tone) {
  if (tone === "active") return "green";
  if (tone === "today" || tone === "overdue") return "warn";
  return "muted";
}

export default function TeacherAssignmentsPage() {
  const [searchParams] = useSearchParams();
  const [assignments, setAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState(null);
  const [duplicateSeed, setDuplicateSeed] = useState(null);
  const [grading, setGrading] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, g, c, s] = await Promise.all([
        asList("/assignments?page_size=200"),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/students?page_size=500"),
      ]);
      setAssignments(a);
      setGroups(g);
      setCourses(c);
      setStudents(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const group = searchParams.get("group");
    const status = searchParams.get("status");
    if (group) setGroupFilter(group);
    if (status === "review") setTab("review");
  }, [searchParams]);

  const groupMap = useMemo(() => new Map(groups.map((row) => [String(row.id), row])), [groups]);
  const courseMap = useMemo(() => new Map(courses.map((row) => [String(row.id), row.name])), [courses]);
  const studentMap = useMemo(() => new Map(students.map((row) => [String(row.id), row])), [students]);

  const enriched = useMemo(
    () =>
      assignments.map((row) => ({
        ...row,
        groupName: groupMap.get(String(row.group))?.name || "—",
        courseName: courseMap.get(String(groupMap.get(String(row.group))?.course)) || "—",
      })),
    [assignments, groupMap, courseMap],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortAssignments(
      enriched.filter((row) => {
        if (!filterAssignmentTab(tab, row)) return false;
        if (groupFilter && String(row.group) !== groupFilter) return false;
        if (courseFilter && String(groupMap.get(String(row.group))?.course) !== courseFilter) return false;
        if (q && !row.title.toLowerCase().includes(q) && !row.groupName.toLowerCase().includes(q)) return false;
        return true;
      }),
    );
  }, [enriched, tab, query, groupFilter, courseFilter, groupMap]);

  const summary = useMemo(() => {
    const active = enriched.filter((row) => row.status === "published").length;
    const pending = enriched.reduce((sum, row) => sum + pendingReviewCount(row), 0);
    const missing = enriched.reduce((sum, row) => sum + Number(row.missing_count || 0), 0);
    const dueSoon = enriched.filter(
      (row) => row.status === "published" && assignmentDueMeta(row.due_at, row.status)?.tone === "today",
    ).length;
    return [
      { key: "groups", label: "Активных", value: active },
      { key: "reviews", label: "На проверку", value: pending },
      { key: "students", label: "Не сдали", value: missing },
      { key: "week", label: "Скоро срок", value: dueSoon },
    ];
  }, [enriched]);

  const attentionItems = useMemo(() => buildAttentionItems(enriched, groupMap), [enriched, groupMap]);

  async function openAssignment(row) {
    setSelected(row);
    try {
      const data = results(await api.get(`/assignments/${row.id}/submissions`));
      setSubmissions(data);
    } catch {
      setSubmissions([]);
    }
  }

  async function handlePublish(id) {
    await api.post(`/assignments/${id}/publish`);
    invalidateApiCache("/assignments");
    await load();
    if (selected?.id === id) await openAssignment({ ...selected, status: "published" });
  }

  async function handleClose(id) {
    await api.patch(`/assignments/${id}`, { status: "closed" });
    invalidateApiCache("/assignments");
    await load();
    if (selected?.id === id) setSelected((prev) => (prev ? { ...prev, status: "closed" } : prev));
  }

  async function confirmRemind() {
    if (!reminderTarget) return;
    setReminderBusy(true);
    try {
      await api.post(`/assignments/${reminderTarget.id}/remind`);
      setReminderTarget(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setReminderBusy(false);
    }
  }

  async function handleGrade(payload, { goNext = false } = {}) {
    if (!grading) return;
    await api.post(`/assignment-submissions/${grading.id}/grade`, payload);
    invalidateApiCache("/assignments");
    const data = results(await api.get(`/assignments/${selected.id}/submissions`));
    setSubmissions(data);
    await load();
    if (goNext) {
      const idx = data.findIndex((row) => row.id === grading.id);
      const next = data.slice(idx + 1).find((row) => ["submitted", "late"].includes(row.status));
      setGrading(next || null);
    } else {
      setGrading(null);
    }
  }

  function startReview(row, subs = submissions) {
    const first = subs.find((item) => ["submitted", "late"].includes(item.status));
    if (first) setGrading(first);
    else openAssignment(row);
  }

  function handleMenuAction(row, action) {
    if (action === "open") openAssignment(row);
    if (action === "edit") {
      setEditAssignment(row);
      setCreateOpen(true);
    }
    if (action === "duplicate") {
      setDuplicateSeed({
        group: row.group,
        course: row.course,
        title: `${row.title} (копия)`,
        description: row.description,
        instructions: row.instructions,
        due_at: null,
        max_score: row.max_score,
        link: row.link,
      });
      setEditAssignment(null);
      setCreateOpen(true);
    }
    if (action === "close") handleClose(row.id);
    if (action === "remind") setReminderTarget(row);
  }

  function handleAttention(item) {
    openAssignment(item.assignment).then(() => {
      if (item.mode === "review") startReview(item.assignment);
      if (item.mode === "missing") setReminderTarget(item.assignment);
    });
  }

  const hasFilters = Boolean(query || groupFilter || courseFilter);

  return (
    <div className="ta-page">
      <header className="tg-header ta-header">
        <div>
          <h1>Задания</h1>
          <p className="tg-sub">Создавайте задания, проверяйте работы и отслеживайте прогресс групп</p>
        </div>
        <Button onClick={() => { setEditAssignment(null); setDuplicateSeed(null); setCreateOpen(true); }}>
          + Создать задание
        </Button>
      </header>

      {error ? (
        <Banner>
          {error}{" "}
          <Button variant="ghost" onClick={load}>
            Повторить
          </Button>
        </Banner>
      ) : null}

      <div className="tg-summary tg-summary-4">
        {summary.map((item) => {
          const Icon = SUMMARY_ICON_MAP[item.key] || IconUsers;
          return (
            <div key={item.key} className={`tg-summary-item tg-summary-${item.key}`}>
              <span className="tg-summary-icon">
                <Icon size={16} />
              </span>
              <div>
                <strong>{loading ? "…" : item.value}</strong>
                <span className="tg-summary-label">{item.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ta-split">
        <section className="ta-main">
          <div className="tg-student-tabs ta-tabs" role="tablist" aria-label="Фильтры заданий">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "is-active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="ta-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Найти задание..." />
            <button
              type="button"
              className="ts-filters-toggle"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              Фильтры
            </button>
            <div className={`ts-toolbar-filters${filtersOpen ? " is-open" : ""}`}>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Группа">
                <option value="">Все группы</option>
                {groups.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label="Курс">
                <option value="">Все курсы</option>
                {courses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              {hasFilters ? (
                <button
                  type="button"
                  className="ts-reset-btn"
                  onClick={() => {
                    setQuery("");
                    setGroupFilter("");
                    setCourseFilter("");
                  }}
                >
                  Сбросить
                </button>
              ) : null}
            </div>
          </div>

          {loading ? <ListSkeleton /> : null}
          {!loading && !rows.length ? (
            <EmptyState
              title="Заданий пока нет"
              body="Создайте первое задание для своей группы."
              action={
                <Button onClick={() => setCreateOpen(true)}>Создать задание</Button>
              }
            />
          ) : null}

          <div className="ta-list">
            {rows.map((row) => (
              <AssignmentRow
                key={row.id}
                row={row}
                onOpen={openAssignment}
                onReview={(item) => openAssignment(item).then(() => startReview(item))}
                onMenuAction={handleMenuAction}
              />
            ))}
          </div>
        </section>

        <aside className="ta-aside">
          <h2 className="ta-aside-title">Требует внимания</h2>
          {!attentionItems.length ? (
            <p className="tg-muted">Срочных задач нет — всё под контролем.</p>
          ) : (
            <ul className="ta-attention-list">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="tg-muted">{item.subtitle}</p>
                  </div>
                  <Button variant="ghost" onClick={() => handleAttention(item)}>
                    {item.action}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <CreateAssignmentSheet
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditAssignment(null);
          setDuplicateSeed(null);
        }}
        groups={groups}
        courses={courses}
        initialGroup={searchParams.get("group") || ""}
        assignment={editAssignment}
        duplicateSeed={duplicateSeed}
        onSaved={async () => {
          setCreateOpen(false);
          setEditAssignment(null);
          setDuplicateSeed(null);
          invalidateApiCache("/assignments");
          await load();
        }}
      />

      <AssignmentDetailPanel
        assignment={selected}
        submissions={submissions.map((row) => ({
          ...row,
          studentName: studentMap.get(String(row.student))?.full_name || row.student_name || "—",
        }))}
        groupName={selected ? groupMap.get(String(selected.group))?.name : ""}
        courseName={selected?.courseName || ""}
        onClose={() => {
          setSelected(null);
          setSubmissions([]);
        }}
        onGrade={(row) => setGrading(row)}
        onRemind={() => selected && setReminderTarget(selected)}
        onPublish={() => selected && handlePublish(selected.id)}
        onEdit={() => {
          setEditAssignment(selected);
          setCreateOpen(true);
        }}
        onDuplicate={() => selected && handleMenuAction(selected, "duplicate")}
        onCloseAssignment={() => selected && handleClose(selected.id)}
        onReviewFirst={(row, subs) => startReview(row, subs)}
      />

      <GradeSubmissionSheet
        submission={grading}
        assignment={selected}
        studentName={grading ? studentMap.get(String(grading.student))?.full_name : ""}
        onClose={() => setGrading(null)}
        onSave={handleGrade}
      />

      <ReminderConfirmModal
        open={Boolean(reminderTarget)}
        recipients={reminderTarget?.missing_count || 0}
        assignmentTitle={reminderTarget?.title || ""}
        busy={reminderBusy}
        onCancel={() => setReminderTarget(null)}
        onConfirm={confirmRemind}
      />
    </div>
  );
}
