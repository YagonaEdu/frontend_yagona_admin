import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banner,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  TextAction,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatDate, formatTime, formatWhen, results, today, toIso } from "@/utils/format";

const VIEWS = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOUR_START = 8;
const HOUR_END = 21;

const emptyForm = {
  course: "",
  group: "",
  teacher: "",
  room: "",
  date: today(),
  start_time: "09:00",
  end_time: "10:00",
  topic: "",
};

function asList(path) {
  return api.get(path).then(results);
}

async function optionalList(path) {
  try {
    return await asList(path);
  } catch {
    return [];
  }
}

function parseDate(value) {
  return new Date(`${value || today()}T12:00:00`);
}

function toLocalDateString(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return today();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const weekday = d.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + offset);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function addMonths(date, amount) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + amount);
  return d;
}

function sameDay(a, b) {
  return toLocalDateString(a) === toLocalDateString(b);
}

function lessonDay(lesson) {
  return toLocalDateString(lesson.starts_at);
}

function lessonHour(lesson) {
  return new Date(lesson.starts_at).getHours();
}

function staffLabel(staff, id) {
  if (!id) return "—";
  const item = staff.find((row) => String(row.id) === String(id));
  if (!item?.user) return "—";
  const user = item.user;
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
}

function combineDateTime(date, time) {
  return new Date(`${date}T${time}:00`);
}

function validateLessonForm(form) {
  if (!form.group || !form.teacher || !form.room || !form.date || !form.start_time || !form.end_time) {
    return "Заполните все обязательные поля.";
  }
  const start = combineDateTime(form.date, form.start_time);
  const end = combineDateTime(form.date, form.end_time);
  if (end <= start) return "Время окончания должно быть позже начала.";
  return "";
}

function lessonToForm(lesson, groups) {
  const group = groups.find((item) => String(item.id) === String(lesson.group));
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    course: group?.course || "",
    group: lesson.group || "",
    teacher: lesson.teacher || "",
    room: lesson.room || "",
    date: toLocalDateString(start),
    start_time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    end_time: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    topic: lesson.topic || "",
  };
}

function formatPeriodLabel(view, anchorDate) {
  const anchor = parseDate(anchorDate);
  if (view === "day") {
    return anchor.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
      return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric",
      })}`;
    }
    return `${start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function enrichLessons(lessons, groups, courses, staff, rooms) {
  const groupMap = Object.fromEntries(groups.map((item) => [String(item.id), item]));
  const courseMap = Object.fromEntries(courses.map((item) => [String(item.id), item]));
  const roomMap = Object.fromEntries(rooms.map((item) => [String(item.id), item]));

  return lessons
    .filter((item) => item.status !== "cancelled")
    .map((lesson) => {
      const group = groupMap[String(lesson.group)];
      const course = group ? courseMap[String(group.course)] : null;
      return {
        ...lesson,
        group_name: group?.name || "—",
        course_name: course?.name || "—",
        course_id: group?.course || "",
        teacher_label: staffLabel(staff, lesson.teacher),
        room_name: roomMap[String(lesson.room)]?.name || "—",
        student_count: group?.active_students ?? null,
      };
    });
}

function scheduleErrorMessage(err) {
  if (err?.status === 409) {
    return "Конфликт расписания: преподаватель, группа или кабинет уже заняты в это время.";
  }
  return err?.message || "Не удалось сохранить занятие.";
}

export default function SchedulePage() {
  const canWrite = currentMembership()?.role !== "teacher";
  const [searchParams] = useSearchParams();
  const [view, setView] = useState("week");
  const [anchorDate, setAnchorDate] = useState(today());
  const [narrow, setNarrow] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formError, setFormError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState(searchParams.get("teacher") || "");
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState(searchParams.get("room") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const teacherFromUrl = searchParams.get("teacher") || "";
    const roomFromUrl = searchParams.get("room") || "";
    if (teacherFromUrl) {
      setTeacherFilter(teacherFromUrl);
      setFiltersOpen(true);
    }
    if (roomFromUrl) {
      setRoomFilter(roomFromUrl);
      setFiltersOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const effectiveView = narrow && view === "week" ? "day" : view;

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [lessonData, groupData, courseData, staffData, roomData] = await Promise.all([
        asList("/lessons?page_size=500&ordering=starts_at"),
        asList("/groups?page_size=100"),
        optionalList("/courses?page_size=100"),
        optionalList("/staff?page_size=100"),
        optionalList("/rooms?page_size=100"),
      ]);
      const teachers = staffData.filter((item) => item.role === "teacher");
      setLessons(lessonData);
      setGroups(groupData);
      setCourses(courseData);
      setStaff(teachers);
      setRooms(roomData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const enriched = useMemo(
    () => enrichLessons(lessons, groups, courses, staff, rooms),
    [lessons, groups, courses, staff, rooms],
  );

  const filtered = useMemo(() => {
    return enriched.filter((lesson) => {
      if (teacherFilter && String(lesson.teacher) !== String(teacherFilter)) return false;
      if (groupFilter && String(lesson.group) !== String(groupFilter)) return false;
      if (courseFilter && String(lesson.course_id) !== String(courseFilter)) return false;
      if (roomFilter && String(lesson.room) !== String(roomFilter)) return false;
      return true;
    });
  }, [enriched, teacherFilter, groupFilter, courseFilter, roomFilter]);

  const periodLessons = useMemo(() => {
    const anchor = parseDate(anchorDate);
    if (effectiveView === "day") {
      const key = toLocalDateString(anchor);
      return filtered.filter((lesson) => lessonDay(lesson) === key);
    }
    if (effectiveView === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return filtered.filter((lesson) => {
        const day = parseDate(lessonDay(lesson));
        return day >= start && day <= end;
      });
    }
    const start = startOfMonth(anchor);
    const end = addDays(addMonths(start, 1), -1);
    return filtered.filter((lesson) => {
      const day = parseDate(lessonDay(lesson));
      return day >= start && day <= end;
    });
  }, [filtered, anchorDate, effectiveView]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseDate(anchorDate));
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [anchorDate]);

  const monthDays = useMemo(() => {
    const first = startOfMonth(parseDate(anchorDate));
    const monthStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(monthStart, index));
  }, [anchorDate]);

  const selected = useMemo(
    () => enriched.find((item) => String(item.id) === String(selectedId)) || null,
    [enriched, selectedId],
  );

  const formGroups = useMemo(() => {
    if (!form.course) return groups;
    return groups.filter((item) => String(item.course) === String(form.course));
  }, [groups, form.course]);

  const editFormGroups = useMemo(() => {
    if (!editForm?.course) return groups;
    return groups.filter((item) => String(item.course) === String(editForm.course));
  }, [groups, editForm?.course]);

  const hasFilters = teacherFilter || groupFilter || courseFilter || roomFilter;
  const periodLabel = formatPeriodLabel(effectiveView, anchorDate);
  const isToday =
    effectiveView === "day"
      ? anchorDate === today()
      : effectiveView === "week"
        ? sameDay(startOfWeek(parseDate(anchorDate)), startOfWeek(parseDate(today())))
        : startOfMonth(parseDate(anchorDate)).getTime() === startOfMonth(parseDate(today())).getTime();

  function goToday() {
    setAnchorDate(today());
  }

  function openDayView(day) {
    setAnchorDate(toLocalDateString(day));
    setView("day");
  }

  function dayAriaLabel(day) {
    return `Открыть расписание на ${day.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    })}`;
  }

  function goPrev() {
    const anchor = parseDate(anchorDate);
    if (effectiveView === "day") setAnchorDate(toLocalDateString(addDays(anchor, -1)));
    else if (effectiveView === "week") setAnchorDate(toLocalDateString(addDays(anchor, -7)));
    else setAnchorDate(toLocalDateString(addMonths(anchor, -1)));
  }

  function goNext() {
    const anchor = parseDate(anchorDate);
    if (effectiveView === "day") setAnchorDate(toLocalDateString(addDays(anchor, 1)));
    else if (effectiveView === "week") setAnchorDate(toLocalDateString(addDays(anchor, 7)));
    else setAnchorDate(toLocalDateString(addMonths(anchor, 1)));
  }

  function openCreate() {
    setFormError("");
    setError("");
    setInfo("");
    setForm({
      ...emptyForm,
      date: effectiveView === "day" ? anchorDate : today(),
      group: groups[0]?.id || "",
      teacher: staff[0]?.id || "",
      room: rooms[0]?.id || "",
      course: groups[0]?.course || "",
    });
    setCreateOpen(true);
  }

  function openLesson(lesson) {
    setFormError("");
    setDeleteConfirm(false);
    setSelectedId(lesson.id);
    setEditOpen(false);
    setEditForm(null);
  }

  function openEdit(lesson = selected) {
    if (!lesson) return;
    setSelectedId(lesson.id);
    setEditForm(lessonToForm(lesson, groups));
    setEditOpen(true);
    setDeleteConfirm(false);
  }

  function closeLesson() {
    setSelectedId("");
    setEditOpen(false);
    setEditForm(null);
    setDeleteConfirm(false);
    setFormError("");
  }

  async function submitLesson(payload, lessonId = null) {
    setBusy(true);
    setFormError("");
    try {
      if (lessonId) await api.patch(`/lessons/${lessonId}`, payload);
      else await api.post("/lessons", payload);
      setInfo(lessonId ? "Занятие сохранено." : "Занятие добавлено.");
      setCreateOpen(false);
      setEditOpen(false);
      setEditForm(null);
      await load();
    } catch (err) {
      setFormError(scheduleErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createLesson(event) {
    event.preventDefault();
    const validation = validateLessonForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    await submitLesson({
      group: form.group,
      teacher: form.teacher,
      room: form.room,
      starts_at: toIso(combineDateTime(form.date, form.start_time)),
      ends_at: toIso(combineDateTime(form.date, form.end_time)),
      topic: form.topic.trim(),
    });
  }

  async function saveLesson(event) {
    event.preventDefault();
    if (!selected || !editForm) return;
    const validation = validateLessonForm(editForm);
    if (validation) {
      setFormError(validation);
      return;
    }
    await submitLesson(
      {
        group: editForm.group,
        teacher: editForm.teacher,
        room: editForm.room,
        starts_at: toIso(combineDateTime(editForm.date, editForm.start_time)),
        ends_at: toIso(combineDateTime(editForm.date, editForm.end_time)),
        topic: editForm.topic.trim(),
      },
      selected.id,
    );
  }

  async function cancelLesson() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.del(`/lessons/${selected.id}`);
      setInfo("Занятие отменено.");
      closeLesson();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setTeacherFilter("");
    setGroupFilter("");
    setCourseFilter("");
    setRoomFilter("");
  }

  function lessonsForDay(day) {
    const key = toLocalDateString(day);
    return periodLessons
      .filter((lesson) => lessonDay(lesson) === key)
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  }

  function cardAccent(lesson) {
    const key = String(lesson.group || lesson.id || "0");
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) % 5;
    return hash;
  }

  function renderLessonCard(lesson, compact = false) {
    return (
      <button
        key={lesson.id}
        type="button"
        className={`schedule-lesson-card schedule-lesson-accent-${cardAccent(lesson)}${
          compact ? " is-compact" : ""
        }`}
        onClick={() => openLesson(lesson)}
      >
        <span className="schedule-lesson-time">
          {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
        </span>
        <strong>{lesson.group_name}</strong>
        <span className="schedule-lesson-course">{lesson.course_name}</span>
        {!compact && (lesson.teacher_label !== "—" || lesson.room_name !== "—") ? (
          <span className="schedule-lesson-meta">
            {[lesson.teacher_label !== "—" ? lesson.teacher_label : null, lesson.room_name !== "—" ? lesson.room_name : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </button>
    );
  }

  function renderLessonFields(values, onChange, groupOptions) {
    return (
      <>
        <Field label="Курс">
          <select
            value={values.course}
            onChange={(e) => onChange({ ...values, course: e.target.value, group: "" })}
          >
            <option value="">Выберите курс</option>
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Группа">
          <select
            value={values.group}
            onChange={(e) => {
              const group = groups.find((item) => String(item.id) === String(e.target.value));
              onChange({
                ...values,
                group: e.target.value,
                course: group?.course || values.course,
                teacher: group?.teacher || values.teacher,
              });
            }}
            required
          >
            <option value="">Выберите группу</option>
            {groupOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Преподаватель">
          <select
            value={values.teacher}
            onChange={(e) => onChange({ ...values, teacher: e.target.value })}
            required
          >
            <option value="">Выберите преподавателя</option>
            {staff
              .filter((item) => item.role === "teacher" || !item.role)
              .map((item) => {
                let avail = "Свободен";
                if (values.date && values.start_time && values.end_time) {
                  const startAt = combineDateTime(values.date, values.start_time).getTime();
                  const endAt = combineDateTime(values.date, values.end_time).getTime();
                  const conflict = lessons.find((l) => {
                    if (String(l.teacher) !== String(item.id) || l.status === "cancelled") return false;
                    if (values.id && String(l.id) === String(values.id)) return false;
                    const a = new Date(l.starts_at).getTime();
                    const b = new Date(l.ends_at).getTime();
                    return a < endAt && b > startAt;
                  });
                  if (conflict) {
                    avail = `Занят ${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}`;
                  }
                }
                return (
                  <option key={item.id} value={item.id}>
                    {staffLabel(staff, item.id)} · {avail}
                  </option>
                );
              })}
          </select>
        </Field>
        <Field label="Дата">
          <input
            type="date"
            value={values.date}
            onChange={(e) => onChange({ ...values, date: e.target.value })}
            required
          />
        </Field>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Начало">
            <input
              type="time"
              value={values.start_time}
              onChange={(e) => onChange({ ...values, start_time: e.target.value })}
              required
            />
          </Field>
          <Field label="Окончание">
            <input
              type="time"
              value={values.end_time}
              onChange={(e) => onChange({ ...values, end_time: e.target.value })}
              required
            />
          </Field>
        </div>
        <Field label="Кабинет">
          <select
            value={values.room}
            onChange={(e) => onChange({ ...values, room: e.target.value })}
            required
          >
            <option value="">Выберите кабинет</option>
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Заметки">
          <textarea
            value={values.topic}
            onChange={(e) => onChange({ ...values, topic: e.target.value })}
            placeholder="Тема или комментарий"
          />
        </Field>
      </>
    );
  }

  return (
    <div className="schedule-page">
      <PageHeader
        title="Расписание"
        subtitle="Управление занятиями учебного центра"
        actions={
          canWrite ? (
            <div className="schedule-head-actions">
              <Button type="button" className="secondary" onClick={goToday}>
                Сегодня
              </Button>
              <Button type="button" onClick={openCreate}>
                + Добавить занятие
              </Button>
            </div>
          ) : (
            <Button type="button" className="secondary" onClick={goToday}>
              Сегодня
            </Button>
          )
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <div className="schedule-controls card">
        <div className="schedule-toolbar">
          <div className="schedule-view-tabs" role="tablist" aria-label="Вид расписания">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                className={`schedule-tab${view === item.id ? " is-active" : ""}`}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="schedule-nav">
            <button type="button" className="schedule-nav-btn" onClick={goPrev} aria-label="Предыдущий период">
              ‹
            </button>
            <div className="schedule-period">
              <strong>{periodLabel}</strong>
              {!isToday ? (
                <button type="button" className="text-action" onClick={goToday}>
                  Сегодня
                </button>
              ) : (
                <span className="schedule-today-badge">Текущий период</span>
              )}
            </div>
            <button type="button" className="schedule-nav-btn" onClick={goNext} aria-label="Следующий период">
              ›
            </button>
          </div>

          <button
            type="button"
            className={`schedule-filter-btn crm-filter-btn${filtersOpen || hasFilters ? " is-active" : ""}`}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            Фильтры
            {hasFilters ? <span className="schedule-filter-dot" aria-hidden="true" /> : null}
          </button>
        </div>

        {filtersOpen ? (
          <div className="schedule-filters">
            <Field label="Преподаватель">
              <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
                <option value="">Все</option>
                {staff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {staffLabel(staff, item.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Группа">
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">Все</option>
                {groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Курс">
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="">Все</option>
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Кабинет">
              <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                <option value="">Все</option>
                {rooms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {hasFilters ? (
              <Button type="button" className="secondary compact" onClick={resetFilters}>
                Сбросить
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="schedule-legend">
          <span>Нажмите на занятие, чтобы открыть детали</span>
          {hasFilters ? <span className="schedule-legend-active">Фильтры активны</span> : null}
        </div>
      </div>

      {narrow && view === "week" ? (
        <p className="schedule-mobile-note muted">На узком экране показан дневной вид.</p>
      ) : null}

      {loading ? (
        <div className="card">
          <EmptyState title="Загрузка…" body="Получаем расписание занятий." />
        </div>
      ) : !periodLessons.length ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? "По выбранным фильтрам занятий не найдено" : "На выбранный период занятий нет"}
            body={
              hasFilters
                ? "Измените фильтры или выберите другой период."
                : "Создайте первое занятие для выбранного периода."
            }
            action={
              canWrite && !hasFilters ? (
                <Button type="button" onClick={openCreate}>
                  + Добавить занятие
                </Button>
              ) : hasFilters ? (
                <Button type="button" className="secondary" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              ) : null
            }
          />
        </div>
      ) : effectiveView === "week" ? (
        <div className="card schedule-grid-card">
          <div className="schedule-grid-head">
            <strong>Неделя</strong>
            <span>{periodLabel}</span>
            <span className="muted">{periodLessons.length} занятий</span>
          </div>
          <div className="schedule-grid-wrap">
            <div className="schedule-week">
              <div className="schedule-corner" />
              {weekDays.map((day, index) => {
                const isTodayHead = sameDay(day, parseDate(today()));
                const isSelectedHead = sameDay(day, parseDate(anchorDate));
                return (
                  <button
                    key={toLocalDateString(day)}
                    type="button"
                    className={`schedule-day-head${isTodayHead ? " is-today" : ""}${
                      isSelectedHead ? " is-selected" : ""
                    }`}
                    aria-label={dayAriaLabel(day)}
                    onClick={() => openDayView(day)}
                  >
                    <span>{WEEKDAY_SHORT[index]}</span>
                    <strong>{day.getDate()}</strong>
                  </button>
                );
              })}
              {Array.from({ length: HOUR_END - HOUR_START }, (_, row) => {
                const hour = HOUR_START + row;
                return (
                  <div key={hour} className={`schedule-row${row % 2 ? " is-alt" : ""}`}>
                    <div className="schedule-time">{String(hour).padStart(2, "0")}:00</div>
                    {weekDays.map((day) => {
                      const items = lessonsForDay(day).filter((lesson) => lessonHour(lesson) === hour);
                      const isTodayCol = sameDay(day, parseDate(today()));
                      const isSelectedCol = sameDay(day, parseDate(anchorDate));
                      return (
                        <div
                          key={`${toLocalDateString(day)}-${hour}`}
                          className={`schedule-slot${isTodayCol ? " is-today-col" : ""}${
                            isSelectedCol ? " is-selected-col" : ""
                          }`}
                        >
                          {items.map((lesson) => renderLessonCard(lesson, true))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : effectiveView === "day" ? (
        <div className="card schedule-day-card">
          <div className="schedule-day-headline">
            {parseDate(anchorDate).toLocaleDateString("ru-RU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <div className="schedule-day-list">
            {lessonsForDay(parseDate(anchorDate)).map((lesson) => (
              <div key={lesson.id} className="schedule-day-item">
                <div className="schedule-day-time">
                  <strong>{formatTime(lesson.starts_at)}</strong>
                  <span>{formatTime(lesson.ends_at)}</span>
                </div>
                <button type="button" className="schedule-day-card-btn" onClick={() => openLesson(lesson)}>
                  <div>
                    <strong>{lesson.group_name}</strong>
                    <span>{lesson.course_name}</span>
                  </div>
                  <div className="muted">
                    {lesson.teacher_label} · {lesson.room_name}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card schedule-month-card">
          <div className="schedule-month-weekdays">
            {WEEKDAY_SHORT.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="schedule-month">
            {monthDays.map((day) => {
              const key = toLocalDateString(day);
              const inMonth = day.getMonth() === parseDate(anchorDate).getMonth();
              const dayLessons = filtered
                .filter((lesson) => lessonDay(lesson) === key)
                .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
              return (
                <button
                  key={key}
                  type="button"
                  className={`schedule-month-day${inMonth ? "" : " is-outside"}${sameDay(day, parseDate(today())) ? " is-today" : ""}`}
                  onClick={() => {
                    setAnchorDate(key);
                    setView("day");
                  }}
                >
                  <span className="schedule-month-date">{day.getDate()}</span>
                  {dayLessons.length ? (
                    <span className="schedule-month-count">{dayLessons.length} зан.</span>
                  ) : null}
                  <div className="schedule-month-preview">
                    {dayLessons.slice(0, 2).map((lesson) => (
                      <span key={lesson.id}>
                        {formatTime(lesson.starts_at)} {lesson.group_name}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {createOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Новое занятие">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={() => setCreateOpen(false)} />
          <form className="sheet sheet-wide" onSubmit={createLesson}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Расписание</div>
                <h2>+ Добавить занятие</h2>
              </div>
              <button type="button" className="sheet-close" onClick={() => setCreateOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="sheet-body">
              <Banner>{formError}</Banner>
              <div className="grid cols-2" style={{ gap: 12 }}>
                {renderLessonFields(form, setForm, formGroups)}
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Сохранить
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Занятие">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={closeLesson} />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">{editOpen ? "Редактирование" : "Занятие"}</div>
                <h2>{editOpen ? "Изменить занятие" : selected.group_name}</h2>
                <p className="muted">
                  {editOpen ? selected.group_name : `${selected.course_name} · ${formatWhen(selected.starts_at)}`}
                </p>
              </div>
              <button type="button" className="sheet-close" onClick={closeLesson} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="sheet-body">
              {editOpen && editForm ? (
                <form className="grid" style={{ gap: 12 }} onSubmit={saveLesson}>
                  <Banner>{formError}</Banner>
                  {renderLessonFields(editForm, setEditForm, editFormGroups)}
                  <div className="row">
                    <Button type="submit" busy={busy}>
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditOpen(false);
                        setEditForm(null);
                        setFormError("");
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="detail-badges">
                    <Badge value={selected.status} />
                    {selected.student_count != null ? (
                      <Badge value="active" label={`${selected.student_count} учеников`} />
                    ) : null}
                  </div>
                  <section className="detail-section">
                    <h3>Детали</h3>
                    <dl className="detail-list">
                      <div className="detail-row">
                        <dt>Курс</dt>
                        <dd>{selected.course_name}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Группа</dt>
                        <dd>{selected.group_name}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Преподаватель</dt>
                        <dd>{selected.teacher_label}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Дата</dt>
                        <dd>{formatDate(selected.starts_at)}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Время</dt>
                        <dd>
                          {formatTime(selected.starts_at)} – {formatTime(selected.ends_at)}
                        </dd>
                      </div>
                      <div className="detail-row">
                        <dt>Кабинет</dt>
                        <dd>{selected.room_name}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Заметки</dt>
                        <dd>{selected.topic || "—"}</dd>
                      </div>
                    </dl>
                  </section>
                  {canWrite ? (
                    <div className="row">
                      <Button type="button" onClick={() => openEdit(selected)}>
                        Изменить
                      </Button>
                      {deleteConfirm ? (
                        <div className="inline-confirm">
                          <span>Отменить занятие?</span>
                          <Button type="button" className="compact" busy={busy} onClick={cancelLesson}>
                            Да
                          </Button>
                          <Button type="button" className="secondary compact" onClick={() => setDeleteConfirm(false)}>
                            Нет
                          </Button>
                        </div>
                      ) : (
                        <TextAction onClick={() => setDeleteConfirm(true)}>Удалить</TextAction>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
