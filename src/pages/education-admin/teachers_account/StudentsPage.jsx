import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, EmptyState, SearchInput } from "@/components/ui";
import { api, getSession, invalidateApiCache } from "@/services/api/client";
import { results, money } from "@/utils/format";
import StudentDrawer from "./StudentDrawer";
import {
  avatarColor,
  buildStudentAttendanceStats,
  computeLastActivity,
  computeStudentAttendancePct,
  formatLastActivityLabel,
  getAttendanceTone,
  getStudentStatus,
  studentInitials,
  studentNeedsAttention,
} from "./groupHelpers";
import { asList, attachGuardiansToStudents, computeStudentDebt, optionalList } from "./utils";
import { IconUsers, SUMMARY_ICON_MAP } from "./tgIcons";

const QUICK_FILTERS = [
  { id: "all", label: "Все" },
  { id: "low_attendance", label: "Низкая посещаемость" },
  { id: "missing", label: "Есть несданные задания" },
  { id: "review", label: "Требуют проверки" },
  { id: "debt", label: "С задолженностью" },
  { id: "active", label: "Активные" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Имя" },
  { value: "attendance", label: "Посещаемость" },
  { value: "result", label: "Средний результат" },
  { value: "activity", label: "Последняя активность" },
  { value: "missing", label: "Несданные задания" },
  { value: "debt", label: "Задолженность" },
];

function TableSkeleton() {
  return (
    <div className="ts-panel ts-skeleton">
      {[1, 2, 3, 4, 5, 6].map((key) => (
        <div key={key} className="ts-skeleton-row" />
      ))}
    </div>
  );
}

function StudentRowButton({ row, onOpen }) {
  return (
    <tr
      className="tg-row-clickable"
      tabIndex={0}
      role="button"
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
    >
      <td>
        <span className="tg-student-cell">
          <span className="tg-student-avatar-sm" style={{ background: avatarColor(row.full_name || row.name) }}>
            {studentInitials(row)}
          </span>
          <span className="ts-student-name-block">
            <span className="tg-student-name">{row.full_name || row.name}</span>
            <span className="ts-student-sub">{row.groupName}</span>
          </span>
        </span>
      </td>
      <td className="ts-col-group">{row.groupName}</td>
      <td>
        <span className={`tg-att-${getAttendanceTone(row.attendancePct)}`}>
          {row.attendancePct != null ? `${row.attendancePct}%` : "—"}
        </span>
        {row.attendancePct != null ? (
          <span className="ts-att-bar" aria-hidden="true">
            <span className="ts-att-fill" style={{ width: `${row.attendancePct}%` }} />
          </span>
        ) : null}
      </td>
      <td>
        <span>{row.assignmentsDone}</span>
        {row.missingCount > 0 ? (
          <span className="ts-cell-sub ts-warn">{row.missingCount} не сдано</span>
        ) : row.pendingReview > 0 ? (
          <span className="ts-cell-sub ts-info">{row.pendingReview} на проверку</span>
        ) : row.totalAssignments > 0 ? (
          <span className="ts-cell-sub">Сдано</span>
        ) : null}
      </td>
      <td>{row.avgScore}</td>
      <td>
        {row.debt > 0 ? (
          <span className="ts-debt-badge">{money(row.debt, row.currency)}</span>
        ) : (
          <span className="tg-muted">Нет</span>
        )}
      </td>
      <td>
        {row.activityLabel ? (
          <>
            <span>{row.activityLabel.prefix}</span>
            <span className="ts-cell-sub">{row.activityLabel.dateLabel}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td>
        <span className={`tg-pill tg-pill-${row.status.tone}`}>{row.status.label}</span>
      </td>
      <td className="tg-row-chevron" aria-hidden="true">
        ›
      </td>
    </tr>
  );
}

function StudentCard({ row, onOpen }) {
  return (
    <button type="button" className="ts-student-card" onClick={() => onOpen(row)}>
      <div className="ts-student-card-head">
        <span className="tg-student-avatar-sm" style={{ background: avatarColor(row.full_name || row.name) }}>
          {studentInitials(row)}
        </span>
        <div>
          <strong>{row.full_name || row.name}</strong>
          <p className="tg-muted">{row.groupName}</p>
        </div>
        <span className="tg-row-chevron" aria-hidden="true">
          ›
        </span>
      </div>
      <dl className="ts-student-card-grid">
        <div>
          <dt>Посещаемость</dt>
          <dd className={`tg-att-${getAttendanceTone(row.attendancePct)}`}>
            {row.attendancePct != null ? `${row.attendancePct}%` : "—"}
          </dd>
        </div>
        <div>
          <dt>Задания</dt>
          <dd>{row.assignmentsDone}</dd>
        </div>
        <div>
          <dt>Результат</dt>
          <dd>{row.avgScore}</dd>
        </div>
        <div>
          <dt>Задолженность</dt>
          <dd className={row.debt > 0 ? "students-debt" : ""}>
            {row.debt > 0 ? money(row.debt, row.currency) : "Нет"}
          </dd>
        </div>
      </dl>
      <span className={`tg-pill tg-pill-${row.status.tone}`}>{row.status.label}</span>
    </button>
  );
}

function reasonTone(text = "") {
  const value = text.toLowerCase();
  if (value.includes("задолженность")) return "debt";
  if (value.includes("посещаемость")) return "warn";
  if (value.includes("проверк")) return "info";
  if (value.includes("не сдан")) return "warn";
  return "muted";
}

function AttentionRow({ row, onOpen }) {
  const name = row.full_name || row.name || "—";
  return (
    <li className="ts-attention-item">
      <button type="button" className="ts-attention-main" onClick={() => onOpen(row)}>
        <span className="tg-student-avatar-sm" style={{ background: avatarColor(name) }}>
          {studentInitials(row)}
        </span>
        <span className="ts-attention-body">
          <strong>{name}</strong>
          <span className="ts-attention-meta">{row.groupName}</span>
          <span className="tg-reason-chips">
            {row.attention.reasons.map((reason) => (
              <span key={reason} className={`tg-reason-chip tg-reason-${reasonTone(reason)}`}>
                {reason}
              </span>
            ))}
          </span>
        </span>
      </button>
      <Button variant="ghost" onClick={() => onOpen(row)}>
        Открыть
      </Button>
    </li>
  );
}

export default function TeacherStudentsPage() {
  const session = getSession();

  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [attendanceByLesson, setAttendanceByLesson] = useState({});
  const [invoices, setInvoices] = useState([]);

  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [s, g, c, e, a, sub, l, inv, guardians, links] = await Promise.all([
        asList("/students?page_size=500"),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/enrollments?page_size=500"),
        asList("/assignments?page_size=200"),
        asList("/assignment-submissions?page_size=500"),
        asList("/lessons?page_size=300"),
        optionalList("/invoices?page_size=500"),
        optionalList("/guardians?page_size=500"),
        optionalList("/student-guardians?page_size=500"),
      ]);
      setStudents(attachGuardiansToStudents(s, guardians, links));
      setGroups(g);
      setCourses(c);
      setEnrollments(e);
      setAssignments(a);
      setSubmissions(sub);
      setLessons(l.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
      setInvoices(inv);

      const groupIds = new Set(g.map((row) => String(row.id)));
      const pastLessons = l
        .filter((row) => groupIds.has(String(row.group)) && new Date(row.starts_at) < new Date())
        .slice(-80);
      const attendanceEntries = await Promise.all(
        pastLessons.map(async (lesson) => {
          try {
            const rows = results(await api.get(`/lessons/${lesson.id}/attendance`, { cache: true }));
            return [lesson.id, rows];
          } catch {
            return [lesson.id, []];
          }
        }),
      );
      setAttendanceByLesson(Object.fromEntries(attendanceEntries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, session.tenantId]);

  const courseMap = useMemo(() => new Map(courses.map((row) => [String(row.id), row.name])), [courses]);
  const groupMap = useMemo(() => new Map(groups.map((row) => [String(row.id), row])), [groups]);

  const publishedByGroup = useMemo(() => {
    const map = new Map();
    assignments
      .filter((row) => row.status === "published")
      .forEach((row) => {
        const key = String(row.group);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
      });
    return map;
  }, [assignments]);

  const allRows = useMemo(() => {
    const activeEnrollments = enrollments.filter((row) => row.status === "active");

    return activeEnrollments
      .map((enrollment) => {
        const group = groupMap.get(String(enrollment.group));
        const student = students.find((row) => String(row.id) === String(enrollment.student));
        if (!group || !student) return null;

        const published = publishedByGroup.get(String(group.id)) || [];
        const studentSubs = submissions.filter((row) => String(row.student) === String(student.id));
        const relevantSubs = studentSubs.filter((row) =>
          published.some((assignment) => String(assignment.id) === String(row.assignment)),
        );
        const graded = relevantSubs.filter((row) => row.status === "graded" && row.score != null);
        const done = relevantSubs.filter((row) => row.status !== "not_submitted").length;
        const missingCount = relevantSubs.filter((row) => row.status === "not_submitted").length;
        const pendingReview = relevantSubs.filter((row) =>
          ["submitted", "late"].includes(row.status),
        ).length;
        const avg =
          graded.length > 0
            ? Math.round(graded.reduce((sum, row) => sum + Number(row.score || 0), 0) / graded.length)
            : null;
        const attendancePct = computeStudentAttendancePct(
          student.id,
          lessons,
          attendanceByLesson,
          group.id,
        );
        const lastActivity = computeLastActivity({
          submissions: relevantSubs,
          lessons,
          attendanceByLesson,
          groupId: group.id,
          studentId: student.id,
        });
        const activityLabel = formatLastActivityLabel(lastActivity, relevantSubs);
        const debt = computeStudentDebt(student.id, invoices);
        const studentInvoices = invoices.filter((row) => String(row.student) === String(student.id));
        const currency = studentInvoices.find((row) => row.currency)?.currency || "UZS";
        const status = getStudentStatus({
          attendancePct,
          missingCount,
          totalAssignments: published.length,
          studentStatus: student.status,
        });
        const attention = studentNeedsAttention({
          attendancePct,
          missingCount,
          pendingReview,
          studentStatus: student.status,
        });
        if (debt > 0) {
          attention.reasons.push(`Задолженность ${money(debt, currency)}`);
          attention.needs = true;
        }

        return {
          ...student,
          enrollmentId: enrollment.id,
          group,
          groupName: group.name,
          courseName: courseMap.get(String(group.course)) || "—",
          courseId: group.course,
          attendancePct,
          assignmentsDone: published.length ? `${done} / ${published.length}` : "—",
          doneCount: done,
          missingCount,
          pendingReview,
          totalAssignments: published.length,
          avgScore: avg != null ? `${avg}%` : "—",
          avgRaw: avg,
          debt,
          currency,
          studentSubs: relevantSubs,
          lastActivity,
          activityLabel,
          status,
          attention,
        };
      })
      .filter(Boolean);
  }, [
    enrollments,
    groupMap,
    students,
    publishedByGroup,
    submissions,
    lessons,
    attendanceByLesson,
    courseMap,
    invoices,
  ]);

  const filteredRows = useMemo(() => {
    let rows = allRows.filter((row) => {
      const name = (row.full_name || row.name || "").toLowerCase();
      if (query && !name.includes(query.toLowerCase())) return false;
      if (groupFilter && String(row.group.id) !== groupFilter) return false;
      if (courseFilter && String(row.courseId) !== courseFilter) return false;

      if (quickFilter === "low_attendance") {
        if (row.attendancePct == null || row.attendancePct >= 75) return false;
      }
      if (quickFilter === "missing") {
        if (row.missingCount <= 0) return false;
      }
      if (quickFilter === "review") {
        if (row.pendingReview <= 0) return false;
      }
      if (quickFilter === "debt") {
        if (row.debt <= 0) return false;
      }
      if (quickFilter === "active") {
        if (row.status.label !== "Активен") return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortBy === "attendance") {
        return (b.attendancePct ?? -1) - (a.attendancePct ?? -1);
      }
      if (sortBy === "result") {
        return (b.avgRaw ?? -1) - (a.avgRaw ?? -1);
      }
      if (sortBy === "activity") {
        return (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0);
      }
      if (sortBy === "missing") {
        return b.missingCount - a.missingCount;
      }
      if (sortBy === "debt") {
        return b.debt - a.debt;
      }
      const nameA = (a.full_name || a.name || "").toLowerCase();
      const nameB = (b.full_name || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "ru");
    });

    return rows;
  }, [allRows, query, groupFilter, courseFilter, quickFilter, sortBy]);

  const summary = useMemo(() => {
    const uniqueStudents = new Set(allRows.map((row) => String(row.id)));
    const activeGroups = groups.filter((row) => row.status === "active").length;
    const attendanceValues = allRows
      .map((row) => row.attendancePct)
      .filter((value) => value != null);
    const avgAttendance = attendanceValues.length
      ? Math.round(attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length)
      : null;
    const attentionCount = allRows.filter((row) => row.attention.needs).length;

    return [
      { key: "students", label: "Всего учеников", value: uniqueStudents.size },
      { key: "groups", label: "Активных групп", value: activeGroups },
      {
        key: "attendance",
        label: "Средняя посещаемость",
        value: avgAttendance != null ? `${avgAttendance}%` : "—",
      },
      { key: "attention", label: "Требуют внимания", value: attentionCount },
    ];
  }, [allRows, groups]);

  const attentionRows = useMemo(
    () => allRows.filter((row) => row.attention.needs).slice(0, 5),
    [allRows],
  );

  const hasActiveFilters = Boolean(query || groupFilter || courseFilter || quickFilter !== "all");

  function resetFilters() {
    setQuery("");
    setGroupFilter("");
    setCourseFilter("");
    setQuickFilter("all");
  }

  function openStudent(row) {
    setSelected(row);
  }

  const selectedAttendance = selected
    ? buildStudentAttendanceStats(selected.id, lessons, attendanceByLesson, selected.group?.id)
    : null;

  return (
    <div className="ts-page">
      <header className="tg-header">
        <div>
          <h1>Мои ученики</h1>
          <p className="tg-sub">Ученики ваших групп и их учебный прогресс</p>
        </div>
      </header>

      {error ? (
        <Banner>
          Не удалось загрузить список учеников.{" "}
          <Button variant="ghost" onClick={() => { invalidateApiCache(); load(); }}>
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

      {!loading && attentionRows.length ? (
        <section className="ts-attention" aria-label="Требуют внимания">
          <div className="ts-attention-head">
            <h2 className="ts-attention-title">Требуют внимания</h2>
            <span className="ts-attention-count">{attentionRows.length}</span>
          </div>
          <ul className="ts-attention-list">
            {attentionRows.map((row) => (
              <AttentionRow
                key={`${row.id}-${row.group.id}`}
                row={row}
                onOpen={openStudent}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="ts-panel">
        <div className="ts-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Найти ученика..." />
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
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Сортировка">
              {SORT_OPTIONS.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
            {hasActiveFilters ? (
              <button type="button" className="ts-reset-btn" onClick={resetFilters}>
                Сбросить
              </button>
            ) : null}
          </div>
        </div>

        <div className="ts-quick-filters" role="tablist" aria-label="Быстрые фильтры">
          {QUICK_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={quickFilter === item.id}
              className={quickFilter === item.id ? "is-active" : ""}
              onClick={() => setQuickFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? <TableSkeleton /> : null}

        {!loading && !allRows.length ? (
          <EmptyState
            title="У вас пока нет учеников"
            body="Ученики появятся здесь, когда вас назначат преподавателем группы."
          />
        ) : null}

        {!loading && allRows.length && !filteredRows.length ? (
          <EmptyState title="Ученики не найдены" body="Попробуйте изменить фильтры или поисковый запрос." />
        ) : null}

        {!loading && filteredRows.length ? (
          <>
            <div className="tg-table-wrap ts-table-desktop">
              <table className="tg-table ts-table">
                <thead>
                  <tr>
                    <th>Ученик</th>
                    <th className="ts-col-group">Группа</th>
                    <th>Посещаемость</th>
                    <th>Задания</th>
                    <th>Средний результат</th>
                    <th>Задолженность</th>
                    <th>Последняя активность</th>
                    <th>Статус</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <StudentRowButton key={`${row.id}-${row.group.id}`} row={row} onOpen={openStudent} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ts-cards-mobile">
              {filteredRows.map((row) => (
                <StudentCard key={`${row.id}-${row.group.id}`} row={row} onOpen={openStudent} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <StudentDrawer
        student={selected}
        onClose={() => setSelected(null)}
        submissions={selected?.studentSubs || []}
        assignments={assignments.filter((row) => String(row.group) === String(selected?.group?.id))}
        group={selected?.group}
        courseName={selected?.courseName}
        attendanceStats={selectedAttendance}
        lastActivity={selected?.lastActivity}
        debt={selected?.debt || 0}
        currency={selected?.currency || "UZS"}
      />
    </div>
  );
}
