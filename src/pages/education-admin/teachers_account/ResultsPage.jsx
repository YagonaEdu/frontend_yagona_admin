import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, EmptyState, SearchInput } from "@/components/ui";
import { api, getSession } from "@/services/api/client";
import { results } from "@/utils/format";
import {
  avatarColor,
  computeStudentAttendancePct,
  getAttendanceTone,
  studentInitials,
} from "./groupHelpers";
import {
  averageScore,
  computeTrend,
  formatScoreLabel,
  hardAssignments,
  inPeriod,
  periodRange,
  reasonChipTone,
  scoreTone,
  studentResultReasons,
} from "./resultHelpers";
import StudentResultDrawer from "./StudentResultDrawer";
import { asList } from "./utils";
import { IconUsers, SUMMARY_ICON_MAP } from "./tgIcons";

const PERIODS = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "month", label: "Этот месяц" },
  { id: "all", label: "Весь период" },
];

const QUICK = [
  { id: "all", label: "Все" },
  { id: "low", label: "Низкий результат" },
  { id: "missing", label: "Несданные задания" },
  { id: "attendance", label: "Низкая посещаемость" },
  { id: "improved", label: "Улучшение" },
];

const SORTS = [
  { id: "name", label: "Имя" },
  { id: "avg", label: "Средний балл" },
  { id: "latest", label: "Последний результат" },
  { id: "attendance", label: "Посещаемость" },
  { id: "trend", label: "Динамика" },
];

function Skeleton() {
  return (
    <div className="tr-skeleton">
      {[1, 2, 3, 4, 5, 6].map((key) => (
        <div key={key} className="tr-skeleton-row" />
      ))}
    </div>
  );
}

export default function TeacherResultsPage() {
  const session = getSession();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [attendanceByLesson, setAttendanceByLesson] = useState({});

  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [period, setPeriod] = useState("30d");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState("all");
  const [sortBy, setSortBy] = useState("avg");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, g, c, e, sub, a, l] = await Promise.all([
        asList("/students?page_size=500"),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/enrollments?page_size=500"),
        asList("/assignment-submissions?page_size=500"),
        asList("/assignments?page_size=200"),
        asList("/lessons?page_size=300"),
      ]);
      setStudents(s);
      setGroups(g);
      setCourses(c);
      setEnrollments(e);
      setSubmissions(sub);
      setAssignments(a);
      setLessons(l.sort((x, y) => new Date(x.starts_at) - new Date(y.starts_at)));

      const groupIds = new Set(g.map((row) => String(row.id)));
      const past = l
        .filter((row) => groupIds.has(String(row.group)) && new Date(row.starts_at) < new Date())
        .slice(-80);
      const entries = await Promise.all(
        past.map(async (lesson) => {
          try {
            const rows = results(await api.get(`/lessons/${lesson.id}/attendance`, { cache: true }));
            return [lesson.id, rows];
          } catch {
            return [lesson.id, []];
          }
        }),
      );
      setAttendanceByLesson(Object.fromEntries(entries));
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
  const assignmentMap = useMemo(
    () => new Map(assignments.map((row) => [String(row.id), row])),
    [assignments],
  );
  const range = useMemo(() => periodRange(period), [period]);

  const allRows = useMemo(() => {
    const active = enrollments.filter((row) => row.status === "active");
    return active
      .map((enrollment) => {
        const group = groupMap.get(String(enrollment.group));
        const student = students.find((row) => String(row.id) === String(enrollment.student));
        if (!group || !student) return null;

        const published = assignments.filter(
          (row) =>
            String(row.group) === String(group.id) &&
            (row.status === "published" || row.status === "closed"),
        );
        const studentSubs = submissions.filter((row) => String(row.student) === String(student.id));
        const relevant = studentSubs.filter((row) =>
          published.some((item) => String(item.id) === String(row.assignment)),
        );
        const gradedAll = relevant
          .filter((row) => row.status === "graded" && row.score != null)
          .map((row) => {
            const assignment = assignmentMap.get(String(row.assignment));
            return {
              ...row,
              maxScore: assignment?.max_score,
              title: assignment?.title,
            };
          })
          .sort(
            (a, b) =>
              new Date(a.graded_at || a.submitted_at || 0) - new Date(b.graded_at || b.submitted_at || 0),
          );
        const gradedPeriod = gradedAll.filter((row) =>
          inPeriod(row.graded_at || row.submitted_at, range),
        );
        const graded = gradedPeriod.length ? gradedPeriod : gradedAll;
        const avg = averageScore(graded);
        const missing = relevant.filter((row) => row.status === "not_submitted").length;
        const done = relevant.filter((row) => row.status !== "not_submitted").length;
        const latest = graded.length ? graded[graded.length - 1] : null;
        const attendancePct = computeStudentAttendancePct(
          student.id,
          lessons,
          attendanceByLesson,
          group.id,
        );
        const trend = computeTrend(gradedAll);
        const reasons = studentResultReasons({
          avg,
          missingCount: missing,
          attendancePct,
          trend,
          gradedCount: graded.length,
        });

        return {
          ...student,
          group,
          groupName: group.name,
          courseName: courseMap.get(String(group.course)) || "—",
          courseId: group.course,
          published,
          studentSubs: relevant,
          graded,
          gradedAll,
          avg,
          missing,
          done,
          totalAssignments: published.length,
          latest,
          attendancePct,
          trend,
          reasons,
        };
      })
      .filter(Boolean);
  }, [
    enrollments,
    groupMap,
    students,
    assignments,
    submissions,
    assignmentMap,
    range,
    lessons,
    attendanceByLesson,
    courseMap,
  ]);

  const filteredRows = useMemo(() => {
    let rows = allRows.filter((row) => {
      if (groupFilter && String(row.group.id) !== groupFilter) return false;
      if (courseFilter && String(row.courseId) !== courseFilter) return false;
      const name = (row.full_name || "").toLowerCase();
      if (query && !name.includes(query.toLowerCase())) return false;
      if (quick === "low" && !(row.avg != null && row.avg < 60)) return false;
      if (quick === "missing" && row.missing <= 0) return false;
      if (quick === "attendance" && !(row.attendancePct != null && row.attendancePct < 75)) return false;
      if (quick === "improved" && !(row.trend && row.trend.delta > 0)) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortBy === "avg") return (b.avg ?? -1) - (a.avg ?? -1);
      if (sortBy === "latest") return (b.latest?.score ?? -1) - (a.latest?.score ?? -1);
      if (sortBy === "attendance") return (b.attendancePct ?? -1) - (a.attendancePct ?? -1);
      if (sortBy === "trend") return (b.trend?.delta ?? 0) - (a.trend?.delta ?? 0);
      return (a.full_name || "").localeCompare(b.full_name || "", "ru");
    });
    return rows;
  }, [allRows, groupFilter, courseFilter, query, quick, sortBy]);

  const summary = useMemo(() => {
    const withAvg = allRows.filter((row) => row.avg != null);
    const avg =
      withAvg.length > 0
        ? Math.round(withAvg.reduce((sum, row) => sum + row.avg, 0) / withAvg.length)
        : null;
    const gradedWorks = allRows.reduce((sum, row) => sum + row.graded.length, 0);
    const attention = allRows.filter((row) => row.reasons.some((r) => r !== "Недостаточно данных")).length;
    const improved = allRows.filter((row) => row.trend && row.trend.delta > 0).length;
    return [
      { key: "attendance", label: "Средний результат", value: avg != null ? `${avg}%` : "—" },
      { key: "reviews", label: "Проверено работ", value: gradedWorks },
      { key: "attention", label: "Требуют внимания", value: attention },
      { key: "students", label: "Улучшили результат", value: improved },
    ];
  }, [allRows]);

  const attentionRows = useMemo(
    () =>
      allRows
        .filter((row) => row.reasons.some((r) => r !== "Недостаточно данных"))
        .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))
        .slice(0, 5),
    [allRows],
  );

  const improvedRows = useMemo(
    () =>
      allRows
        .filter((row) => row.trend && row.trend.delta >= 5)
        .sort((a, b) => b.trend.delta - a.trend.delta)
        .slice(0, 5),
    [allRows],
  );

  const hardRows = useMemo(() => {
    const scoped = groupFilter
      ? assignments.filter((row) => String(row.group) === groupFilter)
      : assignments;
    return hardAssignments(scoped, submissions, range).map((item) => ({
      ...item,
      groupName: groupMap.get(String(item.group))?.name || "—",
    }));
  }, [assignments, submissions, range, groupFilter, groupMap]);

  const groupSummary = useMemo(() => {
    if (!groupFilter) return null;
    const group = groupMap.get(groupFilter);
    if (!group) return null;
    const rows = allRows.filter((row) => String(row.group.id) === groupFilter);
    const withAvg = rows.filter((row) => row.avg != null);
    const avg =
      withAvg.length > 0
        ? Math.round(withAvg.reduce((sum, row) => sum + row.avg, 0) / withAvg.length)
        : null;
    const att = rows.map((row) => row.attendancePct).filter((v) => v != null);
    const attAvg = att.length
      ? Math.round(att.reduce((sum, v) => sum + v, 0) / att.length)
      : null;
    const gradedWorks = rows.reduce((sum, row) => sum + row.graded.length, 0);
    const attention = rows.filter((row) =>
      row.reasons.some((r) => r !== "Недостаточно данных"),
    ).length;
    return {
      name: group.name,
      students: rows.length,
      avg,
      attAvg,
      gradedWorks,
      attention,
    };
  }, [groupFilter, groupMap, allRows]);

  const gradebook = useMemo(() => {
    if (!groupFilter) return { cols: [], rows: [] };
    const cols = assignments
      .filter(
        (row) =>
          String(row.group) === groupFilter &&
          (row.status === "published" || row.status === "closed"),
      )
      .slice(0, 8);
    const rows = filteredRows.map((student) => {
      const cells = cols.map((assignment) => {
        const sub = student.studentSubs.find(
          (row) => String(row.assignment) === String(assignment.id),
        );
        return {
          assignment,
          submission: sub,
          score: sub?.score != null ? sub.score : null,
        };
      });
      return { student, cells, avg: student.avg };
    });
    return { cols, rows };
  }, [groupFilter, assignments, filteredRows]);

  const hasActiveFilters = Boolean(
    query || groupFilter || courseFilter || period !== "30d" || quick !== "all" || sortBy !== "avg",
  );

  function resetFilters() {
    setQuery("");
    setGroupFilter("");
    setCourseFilter("");
    setPeriod("30d");
    setQuick("all");
    setSortBy("avg");
    setFiltersOpen(false);
  }

  function openStudent(row) {
    setSelected(row);
  }

  return (
    <div className="tr-page">
      <header className="tg-header">
        <div>
          <h1>Результаты</h1>
          <p className="tg-sub">Успеваемость ваших групп и учеников</p>
        </div>
      </header>

      {error ? (
        <Banner>
          Не удалось загрузить результаты.{" "}
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

      {groupSummary ? (
        <section className="tr-group-summary" aria-label={`Сводка: ${groupSummary.name}`}>
          <div className="tr-group-summary-head">
            <strong>{groupSummary.name}</strong>
            <span className="tg-muted">{groupSummary.students} учеников</span>
          </div>
          <div className="tr-group-summary-stats">
            <div className="tr-group-stat">
              <span className="tg-muted">Средний результат</span>
              <strong>{groupSummary.avg != null ? `${groupSummary.avg}%` : "—"}</strong>
            </div>
            <div className="tr-group-stat">
              <span className="tg-muted">Посещаемость</span>
              <strong>{groupSummary.attAvg != null ? `${groupSummary.attAvg}%` : "—"}</strong>
            </div>
            <div className="tr-group-stat">
              <span className="tg-muted">Проверено</span>
              <strong>{groupSummary.gradedWorks}</strong>
            </div>
            <div className="tr-group-stat">
              <span className="tg-muted">Требуют внимания</span>
              <strong className={groupSummary.attention ? "tr-stat-warn" : ""}>
                {groupSummary.attention}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      <div className="tr-split">
        <section className="tr-main">
          <div className="tr-toolbar">
            <div className="tr-toolbar-row">
              <SearchInput value={query} onChange={setQuery} placeholder="Найти ученика..." />
              <div className="tr-toolbar-actions">
                <div className="tr-view-toggle" role="tablist" aria-label="Вид">
                  <button
                    type="button"
                    className={view === "list" ? "is-active" : ""}
                    onClick={() => setView("list")}
                  >
                    Список
                  </button>
                  <button
                    type="button"
                    className={view === "gradebook" ? "is-active" : ""}
                    onClick={() => setView("gradebook")}
                    disabled={!groupFilter}
                    title={!groupFilter ? "Сначала выберите группу" : undefined}
                  >
                    Журнал
                  </button>
                </div>
                <button
                  type="button"
                  className="tr-filters-toggle"
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                >
                  Фильтры
                </button>
              </div>
            </div>
            <div className={`tr-toolbar-filters${filtersOpen ? " is-open" : ""}`}>
              <label className="tr-filter-field">
                <span className="tr-filter-label">Группа</span>
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                  <option value="">Все группы</option>
                  {groups.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tr-filter-field">
                <span className="tr-filter-label">Курс</span>
                <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                  <option value="">Все курсы</option>
                  {courses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tr-filter-field">
                <span className="tr-filter-label">Период</span>
                <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {PERIODS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tr-filter-field">
                <span className="tr-filter-label">Сортировка</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  {SORTS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveFilters ? (
                <button type="button" className="tr-reset-btn" onClick={resetFilters}>
                  Сбросить
                </button>
              ) : null}
            </div>
          </div>

          <div className="tr-quick-filters" role="tablist" aria-label="Быстрые фильтры">
            {QUICK.map((item) => (
              <button
                key={item.id}
                type="button"
                className={quick === item.id ? "is-active" : ""}
                onClick={() => setQuick(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? <Skeleton /> : null}

          {!loading && !allRows.length ? (
            <EmptyState
              title="Пока недостаточно данных"
              body="Результаты появятся после проверки заданий."
            />
          ) : null}

          {!loading && allRows.length && !filteredRows.length ? (
            <EmptyState title="Ученики не найдены" />
          ) : null}

          {!loading && filteredRows.length && view === "list" ? (
            <>
              <div className={`tg-table-wrap tr-table-desktop${groupFilter ? " tr-table-group-selected" : ""}`}>
                <table className="tg-table tr-table">
                  <thead>
                    <tr>
                      <th>Ученик</th>
                      <th className="tr-col-group">Группа</th>
                      <th className="tr-col-assign">Заданий</th>
                      <th>Средний балл</th>
                      <th className="tr-col-latest">Последний результат</th>
                      <th>Посещаемость</th>
                      <th className="tr-col-trend">Динамика</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={`${row.id}-${row.group.id}`}
                        className="tg-row-clickable"
                        tabIndex={0}
                        role="button"
                        onClick={() => openStudent(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openStudent(row);
                          }
                        }}
                      >
                        <td>
                          <span className="tg-student-cell">
                            <span
                              className="tg-student-avatar-sm"
                              style={{ background: avatarColor(row.full_name) }}
                            >
                              {studentInitials(row)}
                            </span>
                            <span className="tg-student-name">{row.full_name}</span>
                          </span>
                        </td>
                        <td className="tr-col-group">{row.groupName}</td>
                        <td className="tr-col-assign">
                          {row.totalAssignments
                            ? `${row.done} / ${row.totalAssignments}`
                            : "—"}
                        </td>
                        <td>
                          <span className={`tr-score-${scoreTone(row.avg)}`}>
                            {row.avg != null ? `${row.avg}%` : "—"}
                          </span>
                        </td>
                        <td className="tr-col-latest">
                          {row.latest
                            ? formatScoreLabel(row.latest.score, row.latest.maxScore)
                            : "—"}
                        </td>
                        <td>
                          <span className={`tg-att-${getAttendanceTone(row.attendancePct)}`}>
                            {row.attendancePct != null ? `${row.attendancePct}%` : "—"}
                          </span>
                        </td>
                        <td className="tr-col-trend">
                          {row.trend ? (
                            <span className={`tr-trend-${row.trend.tone}`}>{row.trend.label}</span>
                          ) : (
                            <span className="tg-muted">—</span>
                          )}
                        </td>
                        <td>
                          {row.reasons[0] ? (
                            <span className={`tg-reason-chip tg-reason-${reasonChipTone(row.reasons[0])}`}>
                              {row.reasons[0]}
                            </span>
                          ) : (
                            <span className="tg-pill tg-pill-green">Стабильно</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="tr-cards-mobile">
                {filteredRows.map((row) => (
                  <button
                    key={`${row.id}-${row.group.id}-m`}
                    type="button"
                    className="tr-student-card"
                    onClick={() => openStudent(row)}
                  >
                    <div className="tr-student-card-head">
                      <span
                        className="tg-student-avatar-sm"
                        style={{ background: avatarColor(row.full_name) }}
                      >
                        {studentInitials(row)}
                      </span>
                      <div>
                        <strong>{row.full_name}</strong>
                        <p className="tg-muted">{row.groupName}</p>
                      </div>
                    </div>
                    <dl className="tr-student-card-grid">
                      <div>
                        <dt>Средний балл</dt>
                        <dd className={`tr-score-${scoreTone(row.avg)}`}>
                          {row.avg != null ? `${row.avg}%` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Посещаемость</dt>
                        <dd>{row.attendancePct != null ? `${row.attendancePct}%` : "—"}</dd>
                      </div>
                      <div>
                        <dt>Задания</dt>
                        <dd>
                          {row.totalAssignments ? `${row.done}/${row.totalAssignments}` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Динамика</dt>
                        <dd>{row.trend?.label || "—"}</dd>
                      </div>
                    </dl>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {!loading && view === "gradebook" ? (
            groupFilter ? (
              gradebook.rows.length ? (
                <div className="tr-gradebook-wrap">
                  <table className="tg-table tr-gradebook">
                    <thead>
                      <tr>
                        <th>Ученик</th>
                        {gradebook.cols.map((col) => (
                          <th key={col.id} title={col.title}>
                            {col.title.length > 12 ? `${col.title.slice(0, 12)}…` : col.title}
                          </th>
                        ))}
                        <th>Среднее</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradebook.rows.map(({ student, cells, avg }) => (
                        <tr key={student.id}>
                          <td>
                            <button type="button" className="tr-name-btn" onClick={() => openStudent(student)}>
                              {student.full_name}
                            </button>
                          </td>
                          {cells.map((cell) => (
                            <td key={cell.assignment.id}>
                              {cell.score != null ? cell.score : "—"}
                            </td>
                          ))}
                          <td>
                            <strong className={`tr-score-${scoreTone(avg)}`}>
                              {avg != null ? `${avg}%` : "—"}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="В выбранной группе пока нет оценённых работ" />
              )
            ) : (
              <EmptyState title="Выберите группу" body="Журнал доступен после выбора группы." />
            )
          ) : null}
        </section>

        <aside className="tr-aside">
          <section className="tr-aside-card">
            <h2>Требуют внимания</h2>
            {!attentionRows.length ? (
              <p className="tg-muted">Проблемных учеников нет.</p>
            ) : (
              <ul className="tr-aside-list">
                {attentionRows.map((row) => (
                  <li key={`att-${row.id}-${row.group.id}`}>
                    <div>
                      <strong>{row.full_name}</strong>
                      <p className="tg-muted">{row.reasons.slice(0, 2).join(" · ")}</p>
                    </div>
                    <Button variant="ghost" onClick={() => openStudent(row)}>
                      Открыть
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {improvedRows.length ? (
            <section className="tr-aside-card">
              <h2>Прогресс</h2>
              <ul className="tr-aside-list">
                {improvedRows.map((row) => (
                  <li key={`imp-${row.id}`}>
                    <div>
                      <strong>{row.full_name}</strong>
                      <p className="tg-muted tr-trend-good">{row.trend.label}</p>
                    </div>
                    <Button variant="ghost" onClick={() => openStudent(row)}>
                      Открыть
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hardRows.length ? (
            <section className="tr-aside-card">
              <h2>Сложные задания</h2>
              <ul className="tr-aside-list">
                {hardRows.map((row) => (
                  <li key={`hard-${row.id}`}>
                    <div>
                      <strong>{row.title}</strong>
                      <p className="tg-muted">
                        {row.groupName} · средний {row.avg}%
                        {row.below60 ? ` · ${row.below60} ниже 60%` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <StudentResultDrawer
        student={selected}
        onClose={() => setSelected(null)}
        assignments={assignments.filter((row) => String(row.group) === String(selected?.group?.id))}
        submissions={selected?.studentSubs || []}
        lessons={lessons}
        attendanceByLesson={attendanceByLesson}
      />
    </div>
  );
}
