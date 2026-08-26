import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button } from "@/components/ui";
import { formatDate, formatTime } from "@/utils/format";
import { isSameLocalDay, isTrialLesson } from "./resepshen_yagona/utils";

const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TABS = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "Неделя" },
  { id: "rules", label: "Расписание" },
  { id: "upcoming", label: "Ближайшие" },
];

function formatRuleTime(value) {
  if (!value) return "—";
  const parts = String(value).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : String(value);
}

function staffName(staffMap, id) {
  if (!id) return "—";
  const item = staffMap?.[String(id)];
  const user = item?.user || item;
  if (!user) return "—";
  return (
    user.name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "—"
  );
}

function groupLabel(groupMap, courseMap, groupId) {
  const group = groupMap?.[String(groupId)];
  if (!group) return "—";
  const course = courseMap?.[String(group.course)];
  return course?.name ? `${group.name} · ${course.name}` : group.name;
}

function toLocalDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function roomMonogram(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || "?").slice(0, 2).toUpperCase();
}

export default function RoomDetailPanel({
  room,
  rules = [],
  lessons = [],
  groupMap = {},
  courseMap = {},
  staffMap = {},
  schedulePath = "",
  canWrite = false,
  onEdit,
}) {
  const [tab, setTab] = useState("today");
  const [selectedWeekday, setSelectedWeekday] = useState(new Date().getDay());

  useEffect(() => {
    setTab("today");
    setSelectedWeekday(new Date().getDay());
  }, [room?.id]);

  const activeLessons = useMemo(
    () => (lessons || []).filter((row) => row.status !== "cancelled"),
    [lessons],
  );

  const activeRules = useMemo(
    () => (rules || []).filter((row) => row.is_active !== false),
    [rules],
  );

  const todayLessons = useMemo(
    () =>
      activeLessons
        .filter((row) => isSameLocalDay(row.starts_at))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [activeLessons],
  );

  const upcomingLessons = useMemo(() => {
    const now = Date.now();
    return activeLessons
      .filter((row) => new Date(row.starts_at).getTime() >= now - 5 * 60 * 1000)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 20);
  }, [activeLessons]);

  const nextLesson = upcomingLessons[0] || null;

  const weekdayBusy = useMemo(() => {
    const set = new Set(activeRules.map((row) => Number(row.weekday)));
    return set;
  }, [activeRules]);

  const rulesForDay = useMemo(
    () =>
      activeRules
        .filter((row) => Number(row.weekday) === Number(selectedWeekday))
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))),
    [activeRules, selectedWeekday],
  );

  const weekColumns = useMemo(() => {
    const start = startOfWeek();
    return WEEKDAY_ORDER.map((weekday, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toLocalDateKey(date);
      const dayLessons = activeLessons
        .filter((row) => toLocalDateKey(row.starts_at) === key)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      return {
        weekday,
        label: WEEKDAY_SHORT[weekday],
        date,
        key,
        isToday: key === toLocalDateKey(new Date()),
        isSelected: Number(selectedWeekday) === weekday,
        lessons: dayLessons,
      };
    });
  }, [activeLessons, selectedWeekday]);

  const teachers = useMemo(() => {
    const ids = new Set();
    activeRules.forEach((row) => {
      if (row.teacher) ids.add(String(row.teacher));
    });
    todayLessons.forEach((row) => {
      if (row.teacher) ids.add(String(row.teacher));
    });
    return [...ids].map((id) => ({ id, name: staffName(staffMap, id) }));
  }, [activeRules, todayLessons, staffMap]);

  if (!room) {
    return (
      <section className="reception-panel rooms-detail-panel">
        <div className="rooms-detail-empty">
          <div className="rooms-empty-icon" aria-hidden="true">
            🏫
          </div>
          <h2>Выберите кабинет</h2>
          <p className="muted">Слева список аудиторий — справа занятость и ближайшие уроки.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="reception-panel rooms-detail-panel">
      <div className="rooms-detail-hero">
        <span className="rooms-list-mark" aria-hidden="true">
          {roomMonogram(room.name)}
        </span>
        <div className="rooms-detail-hero-copy">
          <div className="rooms-detail-title-row">
            <h2>{room.name}</h2>
            <Badge
              value={room.is_active !== false ? "active" : "inactive"}
              label={room.is_active !== false ? "активен" : "архив"}
            />
          </div>
          <p className="muted">
            {room.capacity || "—"} мест
            {room.rules_count ? ` · ${room.rules_count} слотов/нед.` : ""}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" variant="ghost" onClick={() => onEdit?.(room)}>
            Изменить
          </Button>
        ) : null}
      </div>

      <div className="rooms-stat-row">
        <div className="rooms-stat-pill">
          <span>Вместимость</span>
          <strong>{room.capacity || "—"}</strong>
        </div>
        <div className="rooms-stat-pill">
          <span>Сегодня</span>
          <strong>{todayLessons.length}</strong>
        </div>
        <div className="rooms-stat-pill">
          <span>Ближайшие</span>
          <strong>{upcomingLessons.length}</strong>
        </div>
      </div>

      <div className="rooms-weekday-row" role="tablist" aria-label="Дни недели">
        {WEEKDAY_ORDER.map((weekday) => {
          const busy = weekdayBusy.has(weekday);
          const isToday = new Date().getDay() === weekday;
          return (
            <button
              key={weekday}
              type="button"
              role="tab"
              aria-selected={selectedWeekday === weekday}
              className={[
                "rooms-weekday-chip",
                busy ? "is-busy" : "",
                isToday ? "is-today" : "",
                selectedWeekday === weekday ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setSelectedWeekday(weekday);
                if (tab === "today") setTab("rules");
              }}
            >
              {WEEKDAY_SHORT[weekday]}
            </button>
          );
        })}
      </div>

      <div className="rooms-detail-tabs" role="tablist" aria-label="Разделы кабинета">
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

      <div className="rooms-detail-body">
        {nextLesson && (tab === "today" || tab === "upcoming") ? (
          <div className="rooms-detail-block rooms-detail-block-muted">
            <h3>Ближайший урок</h3>
            <div className="rooms-next-card">
              <strong>{groupLabel(groupMap, courseMap, nextLesson.group)}</strong>
              <p>
                {formatDate(nextLesson.starts_at)} · {formatTime(nextLesson.starts_at)}–
                {formatTime(nextLesson.ends_at)}
                {` · ${staffName(staffMap, nextLesson.teacher)}`}
              </p>
            </div>
          </div>
        ) : null}

        {tab === "today" ? (
          <div className="rooms-detail-block">
            <div className="rooms-detail-block-head">
              <h3>Расписание на сегодня</h3>
              <span className="rooms-count-badge">{todayLessons.length}</span>
            </div>
            {!todayLessons.length ? (
              <p className="rooms-empty-line">На сегодня занятий нет.</p>
            ) : (
              <ul className="rooms-timeline">
                {todayLessons.map((lesson) => (
                  <li key={lesson.id} className={isTrialLesson(lesson) ? "is-trial" : ""}>
                    <div className="rooms-timeline-time">
                      {formatTime(lesson.starts_at)}
                      <br />
                      <span className="muted">{formatTime(lesson.ends_at)}</span>
                    </div>
                    <div className="rooms-timeline-body">
                      <strong>{groupLabel(groupMap, courseMap, lesson.group)}</strong>
                      <p className="muted">
                        {staffName(staffMap, lesson.teacher)}
                        {lesson.topic ? ` · ${lesson.topic}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "week" ? (
          <div className="rooms-detail-block">
            <div className="rooms-detail-block-head">
              <h3>Неделя</h3>
            </div>
            <div className="rooms-week-grid">
              {weekColumns.map((col) => (
                <div
                  key={col.key}
                  className={[
                    "rooms-week-col",
                    col.isToday ? "is-today" : "",
                    col.isSelected ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="rooms-week-col-head"
                    onClick={() => setSelectedWeekday(col.weekday)}
                  >
                    {col.label}
                  </button>
                  {col.lessons.length ? (
                    col.lessons.slice(0, 4).map((lesson) => (
                      <div key={lesson.id} className="rooms-week-slot">
                        <span>{formatTime(lesson.starts_at)}</span>
                        <span>{groupMap?.[String(lesson.group)]?.name || "—"}</span>
                      </div>
                    ))
                  ) : (
                    <div className="rooms-week-free">свободно</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "rules" ? (
          <div className="rooms-detail-block">
            <div className="rooms-detail-block-head">
              <h3>Слоты · {WEEKDAY_SHORT[selectedWeekday]}</h3>
              <span className="rooms-count-badge">{rulesForDay.length}</span>
            </div>
            {!rulesForDay.length ? (
              <p className="rooms-empty-line">В этот день постоянных слотов нет.</p>
            ) : (
              <ul className="rooms-slot-list">
                {rulesForDay.map((rule) => (
                  <li key={rule.id} className="rooms-slot-card">
                    <div className="rooms-slot-time">
                      {formatRuleTime(rule.starts_at)}–{formatRuleTime(rule.ends_at)}
                    </div>
                    <div>
                      <strong>{groupLabel(groupMap, courseMap, rule.group)}</strong>
                      <p className="muted">{staffName(staffMap, rule.teacher)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "upcoming" ? (
          <div className="rooms-detail-block">
            <div className="rooms-detail-block-head">
              <h3>Ближайшие занятия</h3>
              <span className="rooms-count-badge">{upcomingLessons.length}</span>
            </div>
            {!upcomingLessons.length ? (
              <p className="rooms-empty-line">Предстоящих занятий пока нет.</p>
            ) : (
              <ul className="rooms-upcoming-list">
                {upcomingLessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className={`rooms-upcoming-item${isTrialLesson(lesson) ? " is-trial" : ""}`}
                  >
                    <div className="rooms-upcoming-date">
                      <span>{formatDate(lesson.starts_at)}</span>
                      <strong>
                        {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
                      </strong>
                    </div>
                    <div className="rooms-upcoming-copy">
                      <strong>{groupLabel(groupMap, courseMap, lesson.group)}</strong>
                      <p className="muted">{staffName(staffMap, lesson.teacher)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {teachers.length ? (
          <div className="rooms-detail-block">
            <h3>Преподаватели</h3>
            <div className="rooms-teacher-chips">
              {teachers.map((item) => (
                <span key={item.id} className="rooms-teacher-chip">
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {schedulePath ? (
          <div className="rooms-detail-actions">
            <Link to={schedulePath}>Открыть общее расписание →</Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
