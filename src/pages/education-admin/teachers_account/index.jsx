import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Banner, Button } from "@/components/ui";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { educationSegmentPath } from "@/utils/routes";
import { formatDate, formatTime, results } from "@/utils/format";
import {
  asList,
  formatLocalDateLong,
  isSameLocalDay,
  lessonStatus,
  lessonStatusLabel,
  membershipName,
  minutesUntil,
} from "./utils";

const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatRuleTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : String(value);
}

function reviewPendingCount(row) {
  return Math.max(0, Number(row.submitted_count || 0) - Number(row.graded_count || 0));
}

function reviewProgressPct(row) {
  const submitted = Number(row.submitted_count || 0);
  if (!submitted) return 0;
  return Math.round((Number(row.graded_count || 0) / submitted) * 100);
}

export default function TeacherDashboard() {
  const { tenantSlug = "" } = useParams();
  const navigate = useNavigate();
  const session = getSession();
  const membership = currentMembership(session);
  const path = (segment) => educationSegmentPath(tenantSlug, segment);

  const [stats, setStats] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rules, setRules] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendanceByLesson, setAttendanceByLesson] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [
        dash,
        lessonRows,
        groupRows,
        courseRows,
        roomRows,
        ruleRows,
        enrollmentRows,
        assignmentRows,
        sentRows,
      ] = await Promise.all([
        api.get("/teacher/dashboard", { cache: true }).catch(() => null),
        asList(
          `/lessons?page_size=200&starts_at_from=${todayStr}T00:00:00&starts_at_to=${todayStr}T23:59:59`,
        ),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/rooms?page_size=100"),
        asList("/schedule-rules?page_size=200"),
        asList("/enrollments?page_size=500"),
        asList("/assignments?page_size=100"),
        asList("/notifications/sent?page_size=5").catch(() => []),
      ]);
      setStats(dash);
      setLessons(lessonRows.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
      setGroups(groupRows);
      setCourses(courseRows);
      setRooms(roomRows);
      setRules(ruleRows);
      setEnrollments(enrollmentRows);
      setAssignments(assignmentRows);
      setNotifications(sentRows);

      const attendanceEntries = await Promise.all(
        lessonRows.map(async (lesson) => {
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

  const courseMap = useMemo(
    () => new Map(courses.map((row) => [String(row.id), row.name])),
    [courses],
  );
  const roomMap = useMemo(
    () => new Map(rooms.map((row) => [String(row.id), row.name])),
    [rooms],
  );
  const groupMap = useMemo(
    () => new Map(groups.map((row) => [String(row.id), row])),
    [groups],
  );

  const lessonsToday = useMemo(
    () => lessons.filter((row) => isSameLocalDay(row.starts_at)),
    [lessons],
  );

  const enrichedLessons = useMemo(
    () =>
      lessonsToday.map((lesson) => {
        const group = groupMap.get(String(lesson.group));
        const expected = enrollments.filter(
          (row) => String(row.group) === String(lesson.group) && row.status === "active",
        ).length;
        const marked = (attendanceByLesson[lesson.id] || []).length;
        const status = lessonStatus(lesson, marked, expected);
        return { ...lesson, group, expected, marked, status };
      }),
    [lessonsToday, groupMap, enrollments, attendanceByLesson],
  );

  const nextLesson = useMemo(() => {
    const now = Date.now();
    return (
      enrichedLessons.find(
        (row) => new Date(row.ends_at).getTime() >= now && row.status !== "completed",
      ) ||
      enrichedLessons.find((row) => row.status === "ongoing") ||
      null
    );
  }, [enrichedLessons]);

  const pendingReviews = useMemo(
    () =>
      assignments
        .filter((row) => row.status === "published" && reviewPendingCount(row) > 0)
        .sort((a, b) => reviewPendingCount(b) - reviewPendingCount(a)),
    [assignments],
  );

  const unmarkedToday = useMemo(
    () => enrichedLessons.filter((row) => row.status === "unmarked"),
    [enrichedLessons],
  );

  const attentionItems = useMemo(() => {
    const items = [];
    const pendingTotal = stats?.pending_reviews ?? pendingReviews.reduce((sum, row) => sum + reviewPendingCount(row), 0);
    if (pendingTotal > 0) {
      items.push({
        id: "reviews",
        tone: "warn",
        text: `${pendingTotal} работ ждут проверки`,
        action: "Проверить",
        to: path("assignments"),
      });
    }
    unmarkedToday.forEach((row) => {
      items.push({
        id: `att-${row.id}`,
        tone: "warn",
        text: `${row.group?.name || "Группа"} — посещаемость не отмечена`,
        action: "Отметить",
        to: `${path("attendance")}?lesson=${row.id}`,
      });
    });
    assignments
      .filter((row) => Number(row.missing_count || 0) > 0 && row.status === "published")
      .slice(0, 3)
      .forEach((row) => {
        items.push({
          id: `miss-${row.id}`,
          tone: "muted",
          text: `${row.missing_count} ученик(а) не сдали «${row.title}»`,
          action: "Открыть",
          to: path("assignments"),
        });
      });
    return items.slice(0, 6);
  }, [assignments, unmarkedToday, path, pendingReviews, stats?.pending_reviews]);

  const groupRows = useMemo(
    () =>
      groups.slice(0, 6).map((group) => {
        const groupRules = rules.filter(
          (row) => String(row.group) === String(group.id) && row.is_active !== false,
        );
        const schedule = groupRules
          .map((row) => `${WEEKDAY_SHORT[row.weekday] || "?"} ${formatRuleTime(row.starts_at)}`)
          .join(" · ");
        const activeAssignments = assignments.filter(
          (row) => String(row.group) === String(group.id) && row.status === "published",
        ).length;
        return {
          ...group,
          courseName: courseMap.get(String(group.course)) || "—",
          schedule: schedule || "—",
          students: group.active_students ?? 0,
          activeAssignments,
        };
      }),
    [groups, rules, assignments, courseMap],
  );

  const teacherName = membershipName(membership, session.user);
  const firstName = teacherName.split(" ")[0] || teacherName;
  const dateLabel = formatLocalDateLong(new Date(), { withWeekday: true });
  const mins = nextLesson ? minutesUntil(nextLesson.starts_at) : null;
  const studentsToday =
    stats?.students_today ??
    new Set(
      enrichedLessons.flatMap((lesson) =>
        enrollments
          .filter((row) => String(row.group) === String(lesson.group) && row.status === "active")
          .map((row) => String(row.student)),
      ),
    ).size;
  const summary = [
    { key: "lessons", label: "Занятий сегодня", value: stats?.lessons_today ?? lessonsToday.length },
    { key: "students", label: "Учеников сегодня", value: studentsToday },
    {
      key: "reviews",
      label: "Работ на проверку",
      value: stats?.pending_reviews ?? pendingReviews.reduce((sum, row) => sum + reviewPendingCount(row), 0),
    },
    {
      key: "unmarked",
      label: "Не отмечена посещаемость",
      value: stats?.unmarked_attendance ?? unmarkedToday.length,
    },
  ];

  return (
    <div className="td-page">
      <header className="td-header">
        <div className="td-header-copy">
          <h1>Мой день</h1>
          <p className="td-header-date">{dateLabel}</p>
          <p className="td-header-sub">Ваши занятия и задачи на сегодня</p>
        </div>
        <div className="td-header-meta">
          <button
            type="button"
            className="td-icon-btn"
            aria-label="Уведомления"
            onClick={() => navigate(path("notifications"))}
          >
            ✉
          </button>
          <button
            type="button"
            className="td-profile"
            onClick={() => navigate(path("profile"))}
          >
            <Avatar name={teacherName} />
            <span>
              <strong>{firstName}</strong>
              <small>Преподаватель</small>
            </span>
          </button>
        </div>
      </header>

      {error ? <Banner>{error}</Banner> : null}

      <div className="td-summary" aria-label="Сводка на сегодня">
        {summary.map((item) => (
          <div key={item.key} className="td-summary-item">
            <span className="td-summary-label">{item.label}</span>
            <strong className="td-summary-value">{loading ? "…" : item.value}</strong>
          </div>
        ))}
      </div>

      <div className="td-actions">
        <Button onClick={() => navigate(path("assignments"))}>+ Создать задание</Button>
        <Button variant="ghost" onClick={() => navigate(path("attendance"))}>
          + Отметить посещаемость
        </Button>
        <Button variant="ghost" onClick={() => navigate(path("materials"))}>
          + Добавить материал
        </Button>
        <Button variant="ghost" onClick={() => navigate(path("notifications"))}>
          + Написать группе
        </Button>
      </div>

      <div className="td-grid">
        <div className="td-main">
          <section className="td-panel td-next">
            <div className="td-panel-head">
              <h2>Следующее занятие</h2>
            </div>
            {nextLesson ? (
              <div className="td-next-body">
                <div className="td-next-accent" aria-hidden="true" />
                <div className="td-next-content">
                  <div className="td-next-top">
                    <div>
                      <p className="td-kicker">
                        {courseMap.get(String(nextLesson.group?.course)) || "Курс"}
                      </p>
                      <h3>{nextLesson.group?.name || "—"}</h3>
                      <p className="td-next-time">
                        {formatTime(nextLesson.starts_at)}–{formatTime(nextLesson.ends_at)}
                      </p>
                    </div>
                    <div className="td-next-status">
                      {nextLesson.status === "ongoing" ? (
                        <span className="td-pill td-pill-live">Идёт сейчас</span>
                      ) : mins != null && nextLesson.status === "upcoming" ? (
                        <span className="td-pill td-pill-soon">Через {mins} мин</span>
                      ) : (
                        <span className="td-pill">{lessonStatusLabel(nextLesson.status)}</span>
                      )}
                    </div>
                  </div>
                  <p className="td-next-meta">
                    {nextLesson.expected} учеников · Кабинет{" "}
                    {roomMap.get(String(nextLesson.room)) || "—"}
                  </p>
                  <div className="td-next-actions">
                    <Button onClick={() => navigate(path("schedule"))}>Открыть занятие</Button>
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`${path("attendance")}?lesson=${nextLesson.id}`)}
                    >
                      Посещаемость
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="td-empty">
                <strong>
                  {lessonsToday.length ? "На сегодня все занятия завершены" : "Сегодня занятий нет"}
                </strong>
                <p>Ваше ближайшее занятие появится здесь.</p>
              </div>
            )}
          </section>

          <section className="td-panel">
            <div className="td-panel-head">
              <h2>Сегодня</h2>
              <Link to={path("schedule")} className="td-link">
                Расписание
              </Link>
            </div>
            {enrichedLessons.length ? (
              <ul className="td-timeline">
                {enrichedLessons.map((lesson) => {
                  const isCurrent = lesson.id === nextLesson?.id;
                  return (
                    <li
                      key={lesson.id}
                      className={`td-timeline-item${isCurrent ? " is-current" : ""} status-${lesson.status}`}
                    >
                      <div className="td-timeline-rail" aria-hidden="true">
                        <span className="td-timeline-dot" />
                      </div>
                      <div className="td-timeline-time">
                        {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
                      </div>
                      <div className="td-timeline-body">
                        <strong>
                          {courseMap.get(String(lesson.group?.course)) || lesson.group?.name || "—"}
                        </strong>
                        <p>{lesson.group?.name}</p>
                        <p className="td-muted">
                          Кабинет {roomMap.get(String(lesson.room)) || "—"} · {lesson.expected}{" "}
                          учеников
                        </p>
                        <span className={`td-status td-status-${lesson.status}`}>
                          {lessonStatusLabel(lesson.status)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="td-row-action"
                        onClick={() => navigate(`${path("attendance")}?lesson=${lesson.id}`)}
                      >
                        {lesson.status === "unmarked" ? "Посещаемость" : "Открыть"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="td-empty compact">
                <strong>Сегодня занятий нет</strong>
                <p>Ваше ближайшее занятие появится здесь.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="td-side">
          <section className="td-panel">
            <div className="td-panel-head">
              <h2>Требует внимания</h2>
            </div>
            {attentionItems.length ? (
              <ul className="td-attention">
                {attentionItems.map((item) => (
                  <li key={item.id} className={`tone-${item.tone}`}>
                    <span className="td-attention-dot" aria-hidden="true" />
                    <span className="td-attention-text">{item.text}</span>
                    <button type="button" className="td-row-action" onClick={() => navigate(item.to)}>
                      {item.action}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="td-empty compact">
                <strong>На сегодня всё в порядке</strong>
              </div>
            )}
          </section>

          <section className="td-panel">
            <div className="td-panel-head">
              <h2>На проверку</h2>
              <Link to={path("assignments")} className="td-link">
                Все
              </Link>
            </div>
            {pendingReviews.length ? (
              <ul className="td-review">
                {pendingReviews.slice(0, 4).map((row) => {
                  const pending = reviewPendingCount(row);
                  const pct = reviewProgressPct(row);
                  const groupName = groupMap.get(String(row.group))?.name || "—";
                  return (
                    <li key={row.id}>
                      <div className="td-review-copy">
                        <strong>{row.title}</strong>
                        <p className="td-muted">{groupName}</p>
                        <p className="td-muted">
                          Сдали: {row.submitted_count || 0} / {row.total_students || 0} · Проверено:{" "}
                          {row.graded_count || 0}
                        </p>
                        <div className="td-progress" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="td-row-action"
                        onClick={() => navigate(path("assignments"))}
                      >
                        Проверить
                        {pending ? ` (${pending})` : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="td-empty compact">
                <strong>Работ на проверку нет</strong>
              </div>
            )}
          </section>

          {notifications.length ? (
            <section className="td-panel td-panel-quiet">
              <div className="td-panel-head">
                <h2>Уведомления</h2>
                <Link to={path("notifications")} className="td-link">
                  Все
                </Link>
              </div>
              <ul className="td-notify">
                {notifications.slice(0, 3).map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    <p className="td-muted">{formatDate(row.created_at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="td-panel td-groups">
        <div className="td-panel-head">
          <h2>Мои группы</h2>
          <Link to={path("groups")} className="td-link">
            Все группы
          </Link>
        </div>
        {groupRows.length ? (
          <ul className="td-group-rows">
            {groupRows.map((group) => (
              <li key={group.id}>
                <div className="td-group-main">
                  <strong>{group.name}</strong>
                  <p className="td-muted">{group.courseName}</p>
                </div>
                <div className="td-group-meta">
                  <span>{group.students} учеников</span>
                  <span>{group.schedule}</span>
                  {group.activeAssignments > 0 ? (
                    <span>{group.activeAssignments} активных заданий</span>
                  ) : null}
                </div>
                <div className="td-group-actions">
                  <button type="button" className="td-row-action" onClick={() => navigate(path("groups"))}>
                    Открыть
                  </button>
                  <button
                    type="button"
                    className="td-row-action"
                    onClick={() => navigate(path("assignments"))}
                  >
                    Задание
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="td-empty compact">
            <strong>Группы ещё не назначены</strong>
          </div>
        )}
      </section>
    </div>
  );
}
