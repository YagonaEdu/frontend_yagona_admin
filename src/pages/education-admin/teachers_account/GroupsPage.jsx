import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Banner, Button, EmptyState, SearchInput } from "@/components/ui";
import { api, getSession, invalidateApiCache } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { educationSegmentPath } from "@/utils/routes";
import { results } from "@/utils/format";
import CreateAssignmentSheet from "./CreateAssignmentSheet";
import GroupContextMenu from "./GroupContextMenu";
import GroupDetailPanel from "./GroupDetailPanel";
import {
  buildScheduleSummary,
  computeGroupAttendancePct,
  findNextLesson,
  formatNextLessonLabel,
  getWeekBounds,
  groupAttentionItems,
  pickDefaultGroupId,
  reviewPendingCount,
} from "./groupHelpers";
import { asList, attachGuardiansToStudents, isSameLocalDay, membershipName, optionalList } from "./utils";
import { IconGroups, SUMMARY_ICON_MAP } from "./tgIcons";

const STATUS_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "planned", label: "Запланированные" },
  { value: "completed", label: "Завершённые" },
];

function GroupsSkeleton() {
  return (
    <div className="tg-split">
      <div className="tg-list-pane tg-skeleton">
        {[1, 2, 3].map((key) => (
          <div key={key} className="tg-skeleton-card" />
        ))}
      </div>
      <div className="tg-detail-pane tg-skeleton">
        <div className="tg-skeleton-head" />
        <div className="tg-skeleton-tabs" />
        <div className="tg-skeleton-table" />
      </div>
    </div>
  );
}

export default function TeacherGroupsPage() {
  const { tenantSlug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const session = getSession();
  const path = (segment) => educationSegmentPath(tenantSlug, segment);

  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rules, setRules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [attendanceByLesson, setAttendanceByLesson] = useState({});
  const [dashStats, setDashStats] = useState(null);

  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [selectedId, setSelectedId] = useState(null);
  const [createForGroup, setCreateForGroup] = useState(null);
  const [detailTab, setDetailTab] = useState("students");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [dash, g, c, r, a, sub, m, e, rm, l, st, guardians, links] = await Promise.all([
        api.get("/teacher/dashboard", { cache: true }).catch(() => null),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/schedule-rules?page_size=200"),
        asList("/assignments?page_size=200"),
        asList("/assignment-submissions?page_size=500"),
        asList("/materials?page_size=200"),
        asList("/enrollments?page_size=500"),
        asList("/rooms?page_size=100"),
        asList("/lessons?page_size=300"),
        asList("/students?page_size=500"),
        optionalList("/guardians?page_size=500"),
        optionalList("/student-guardians?page_size=500"),
      ]);
      setDashStats(dash);
      setGroups(g);
      setCourses(c);
      setRules(r);
      setAssignments(a);
      setSubmissions(sub);
      setMaterials(m);
      setEnrollments(e);
      setRooms(rm);
      setLessons(l.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
      setStudents(attachGuardiansToStudents(st, guardians, links));

      const pastLessons = l.filter((row) => new Date(row.starts_at) < new Date()).slice(-80);
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
  const roomMap = useMemo(() => new Map(rooms.map((row) => [String(row.id), row.name])), [rooms]);
  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekBounds(), []);

  const rows = useMemo(() => {
    return groups
      .map((group) => {
        const groupRules = rules.filter(
          (row) => String(row.group) === String(group.id) && row.is_active !== false,
        );
        const schedule = buildScheduleSummary(groupRules);
        const roomId = groupRules[0]?.room;
        const groupLessons = lessons.filter((row) => String(row.group) === String(group.id));
        const groupAssignments = assignments.filter((row) => String(row.group) === String(group.id));
        const published = groupAssignments.filter((row) => row.status === "published");
        const pendingReviews = published.reduce((sum, row) => sum + reviewPendingCount(row), 0);
        const missingSubmissions = published.reduce(
          (sum, row) => sum + Number(row.missing_count || 0),
          0,
        );
        const studentCount =
          group.active_students ??
          enrollments.filter((row) => String(row.group) === String(group.id) && row.status === "active")
            .length;
        const nextLesson = findNextLesson(lessons, group.id);
        const attendancePct = computeGroupAttendancePct(lessons, attendanceByLesson, group.id);
        const todayLessons = groupLessons.filter((row) => isSameLocalDay(row.starts_at));
        const unmarkedToday = todayLessons.filter((lesson) => {
          const expected = studentCount;
          const marked = (attendanceByLesson[lesson.id] || []).length;
          return expected > 0 && marked < expected && new Date(lesson.starts_at) < new Date();
        }).length;

        return {
          ...group,
          courseName: courseMap.get(String(group.course)) || "—",
          schedule,
          roomName: roomMap.get(String(roomId)) || "—",
          studentCount,
          pendingReviews,
          missingSubmissions,
          nextLesson,
          nextLessonLabel: formatNextLessonLabel(nextLesson),
          nextLessonToday: nextLesson ? isSameLocalDay(nextLesson.starts_at) : false,
          attendancePct,
          unmarkedToday,
          groupLessons,
        };
      })
      .filter((group) => {
        if (courseFilter && String(group.course) !== courseFilter) return false;
        if (statusFilter && group.status !== statusFilter) return false;
        if (query && !group.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      });
  }, [
    groups,
    rules,
    lessons,
    assignments,
    enrollments,
    courseFilter,
    statusFilter,
    query,
    courseMap,
    roomMap,
    attendanceByLesson,
  ]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    const fromUrl = searchParams.get("group");
    if (fromUrl && rows.some((row) => String(row.id) === String(fromUrl))) {
      setSelectedId(fromUrl);
      return;
    }
    if (!selectedId || !rows.some((row) => String(row.id) === String(selectedId))) {
      setSelectedId(pickDefaultGroupId(rows));
    }
  }, [rows, selectedId, searchParams]);

  const selected = useMemo(
    () => rows.find((row) => String(row.id) === String(selectedId)) || null,
    [rows, selectedId],
  );

  const summary = useMemo(() => {
    const activeEnrollments = enrollments.filter((row) => row.status === "active");
    const weekLessonCount = lessons.filter((row) => {
      const d = new Date(row.starts_at);
      return d >= weekStart && d <= weekEnd;
    }).length;
    const pendingTotal = assignments
      .filter((row) => row.status === "published")
      .reduce((sum, row) => sum + reviewPendingCount(row), 0);

    return [
      { key: "groups", label: "Мои группы", value: groups.length },
      {
        key: "students",
        label: "Учеников",
        value: dashStats?.students_count ?? activeEnrollments.length,
      },
      { key: "week", label: "Занятий на неделе", value: weekLessonCount },
      { key: "reviews", label: "На проверку", value: dashStats?.pending_reviews ?? pendingTotal },
    ];
  }, [groups, enrollments, lessons, assignments, dashStats, weekStart, weekEnd]);

  function openAttendance(groupRow) {
    const target =
      groupRow.nextLesson && isSameLocalDay(groupRow.nextLesson.starts_at)
        ? groupRow.nextLesson
        : groupRow.groupLessons.find((row) => new Date(row.starts_at) < new Date()) || groupRow.nextLesson;
    if (target) {
      navigate(`${path("attendance")}?lesson=${target.id}`);
      return;
    }
    navigate(path("attendance"));
  }

  function openNotify(groupRow) {
    navigate(`${path("notifications")}?group=${groupRow.id}`);
  }

  async function handleAssignmentSaved() {
    setCreateForGroup(null);
    invalidateApiCache("/assignments");
    await load();
  }

  const teacherName = membershipName(currentMembership(session), session?.user);

  return (
    <div className="tg-page">
      <header className="tg-header">
        <div>
          <h1>Мои группы</h1>
          <p className="tg-sub">Ваши группы, ученики и учебный процесс</p>
        </div>
      </header>

      {error ? <Banner>{error}</Banner> : null}

      <div className="tg-summary tg-summary-4">
        {summary.map((item) => {
          const Icon = SUMMARY_ICON_MAP[item.key] || IconGroups;
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

      {loading ? <GroupsSkeleton /> : null}

      {!loading && !groups.length ? (
        <EmptyState
          title="У вас пока нет назначенных групп"
          body="Когда администратор назначит вам группу, она появится здесь."
        />
      ) : null}

      {!loading && groups.length ? (
        <div className="tg-split">
          <section className="tg-list-pane">
            <div className="tg-list-toolbar">
              <SearchInput value={query} onChange={setQuery} placeholder="Найти группу..." />
              <div className="tg-list-toolbar-row">
                <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label="Курс">
                  <option value="">Все курсы</option>
                  {courses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Статус">
                  {STATUS_OPTIONS.map((row) => (
                    <option key={row.value || "all"} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!rows.length ? <EmptyState title="Группы не найдены" /> : null}

            <div className="tg-list">
              {rows.map((row) => {
                const isActive = String(row.id) === String(selectedId);
                const alert = groupAttentionItems(row)[0];
                return (
                  <article
                    key={row.id}
                    className={`tg-list-item${isActive ? " is-selected" : ""}${row.nextLessonToday ? " is-today" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(row.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                  >
                    <div className="tg-list-item-top">
                      <div className="tg-list-item-head">
                        <strong>{row.name}</strong>
                        <span className={`tg-status tg-status-${row.status}`}>
                          {statusLabel(row.status)}
                        </span>
                      </div>
                      <p className="tg-list-course">{row.courseName}</p>
                    </div>

                    <ul className="tg-list-lines">
                      <li>{row.studentCount} ученик</li>
                      <li>{row.schedule.days}</li>
                      <li>{row.schedule.time}</li>
                      <li>Каб. {row.roomName}</li>
                    </ul>

                    {row.nextLessonLabel ? (
                      <div className={`tg-next-block${row.nextLessonToday ? " is-today" : ""}`}>
                        <span className="tg-next-label">Следующее занятие</span>
                        <span>{row.nextLessonLabel}</span>
                      </div>
                    ) : (
                      <p className="tg-muted tg-next-empty">Ближайших занятий нет</p>
                    )}

                    <div className="tg-list-attendance">
                      <div className="tg-progress-row">
                        <span className="tg-muted">Посещаемость</span>
                        <strong>{row.attendancePct != null ? `${row.attendancePct}%` : "—"}</strong>
                      </div>
                      <div className="tg-progress">
                        <span style={{ width: `${row.attendancePct ?? 0}%` }} />
                      </div>
                    </div>

                    <div className="tg-list-item-foot">
                      {alert ? <span className="tg-list-alert">{alert}</span> : <span />}
                      <GroupContextMenu
                        ariaLabel={`Действия: ${row.name}`}
                        onAttendance={() => openAttendance(row)}
                        onCreateAssignment={() => setCreateForGroup(row)}
                        onAddMaterial={() => {
                          setSelectedId(row.id);
                          setDetailTab("materials");
                        }}
                        onNotify={() => openNotify(row)}
                        onOpenSchedule={() => navigate(`${path("schedule")}?group=${row.id}`)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="tg-detail-pane">
            {selected ? (
              <GroupDetailPanel
                inline
                group={selected}
                teacherName={teacherName}
                initialTab={detailTab}
                onTabChange={setDetailTab}
                enrollments={enrollments}
                students={students}
                assignments={assignments.filter((row) => String(row.group) === String(selected.id))}
                submissions={submissions.filter((row) =>
                  assignments.some(
                    (a) =>
                      String(a.group) === String(selected.id) &&
                      String(a.id) === String(row.assignment),
                  ),
                )}
                materials={materials.filter((row) => String(row.group) === String(selected.id))}
                rules={rules.filter((row) => String(row.group) === String(selected.id))}
                lessons={lessons.filter((row) => String(row.group) === String(selected.id))}
                attendanceByLesson={attendanceByLesson}
                courseName={courseMap.get(String(selected.course)) || ""}
                roomMap={roomMap}
                onOpenAttendance={openAttendance}
                onCreateAssignment={(group) => setCreateForGroup(group)}
                onOpenSchedule={(groupId) => navigate(`${path("schedule")}?group=${groupId}`)}
                onOpenAssignments={(assignmentId) =>
                  navigate(
                    assignmentId
                      ? `${path("assignments")}?assignment=${assignmentId}`
                      : path("assignments"),
                  )
                }
                onNotify={() => openNotify(selected)}
                onRefresh={load}
              />
            ) : (
              <div className="tg-detail-empty">
                <strong>Выберите группу</strong>
                <p className="tg-muted">Выберите группу слева для работы с учениками и заданиями</p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <CreateAssignmentSheet
        open={Boolean(createForGroup)}
        onClose={() => setCreateForGroup(null)}
        groups={groups}
        courses={courses}
        initialGroup={createForGroup?.id || ""}
        lockGroup={Boolean(createForGroup)}
        onSaved={handleAssignmentSaved}
      />
    </div>
  );
}

function statusLabel(status) {
  const map = {
    active: "Активна",
    planned: "Запланирована",
    completed: "Завершена",
    archived: "Архив",
  };
  return map[status] || status;
}
