import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Banner, Button, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/services/api/client";
import { educationSegmentPath } from "@/utils/routes";
import { formatDay, formatTime, formatUzPhone, results, toApiPhone, today } from "@/utils/format";
import {
  buildTrialTopic,
  combineDateTime,
  digits,
  isSameLocalDay,
  isTrialLesson,
  parseTrialTopic,
  staffLabel,
} from "./utils";
import TrialDetailPanel from "./TrialDetailPanel";
import TrialLessonSheet from "./TrialLessonSheet";

async function asList(path) {
  try {
    return results(await api.get(path));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    return [];
  }
}

function findTrialLead(leads, parsed) {
  if (!parsed?.name && !parsed?.phone) return null;
  return (
    leads.find(
      (l) =>
        (parsed.phone && digits(l.phone) === digits(parsed.phone)) ||
        (parsed.name && l.full_name === parsed.name),
    ) || null
  );
}

function TrialListItem({ lesson, selected, onSelect, groupMap, staffMap }) {
  const parsed = parseTrialTopic(lesson.topic);
  const status = lesson.status || "scheduled";

  return (
    <li className={selected ? "is-selected" : ""}>
      <button type="button" className="trials-list-btn" onClick={() => onSelect(lesson)}>
        <div className="trials-list-main">
          <strong>
            {formatDay(lesson.starts_at)} · {formatTime(lesson.starts_at)} ·{" "}
            {parsed.name || "Посетитель"}
          </strong>
          <p className="muted">
            {parsed.phone ? formatUzPhone(parsed.phone) : "—"} · {groupMap[String(lesson.group)]?.name || "—"} ·{" "}
            {staffMap[String(lesson.teacher)]
              ? staffLabel(staffMap[String(lesson.teacher)])
              : "без преподавателя"}
          </p>
        </div>
        <span className={`status ${status}`}>
          {status === "cancelled" ? "отменён" : status === "completed" ? "проведён" : "запланирован"}
        </span>
      </button>
    </li>
  );
}

export default function TrialsPage() {
  const { tenantSlug = "" } = useParams();
  const path = (segment = "", query = "") =>
    educationSegmentPath(tenantSlug, segment) + (query ? `?${query}` : "");

  const [lessons, setLessons] = useState([]);
  const [leads, setLeads] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [trialOpen, setTrialOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [statusSaving, setStatusSaving] = useState(false);
  const [trialForm, setTrialForm] = useState({
    course: "",
    group: "",
    date: today(),
    start_time: "16:00",
    end_time: "17:00",
    teacher: "",
    room: "",
    comment: "",
  });
  const [trialPerson, setTrialPerson] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [lessonData, leadData, studentData, groupData, courseData, staffData, roomData] =
        await Promise.all([
          asList("/lessons?page_size=300"),
          asList("/leads?page_size=200"),
          asList("/students?page_size=200"),
          asList("/groups?page_size=100"),
          asList("/courses?page_size=100"),
          asList("/staff?page_size=100"),
          asList("/rooms?page_size=100"),
        ]);
      setLessons(lessonData);
      setLeads(leadData);
      setStudents(studentData);
      setGroups(groupData);
      setCourses(courseData);
      setStaff(staffData.filter((s) => s.role === "teacher"));
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

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((g) => [String(g.id), g])),
    [groups],
  );
  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [String(c.id), c])),
    [courses],
  );
  const staffMap = useMemo(
    () => Object.fromEntries(staff.map((s) => [String(s.id), s])),
    [staff],
  );
  const roomMap = useMemo(
    () => Object.fromEntries(rooms.map((r) => [String(r.id), r])),
    [rooms],
  );

  const trials = useMemo(
    () =>
      lessons
        .filter(isTrialLesson)
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)),
    [lessons],
  );

  const filteredTrials = useMemo(() => {
    const now = Date.now();
    if (filter === "today") return trials.filter((l) => isSameLocalDay(l.starts_at));
    if (filter === "upcoming") {
      return trials.filter(
        (l) => l.status !== "cancelled" && new Date(l.starts_at).getTime() >= now - 3600000,
      );
    }
    if (filter === "past") {
      return trials.filter((l) => new Date(l.starts_at).getTime() < now);
    }
    return trials;
  }, [trials, filter]);

  const selected = useMemo(
    () => trials.find((l) => String(l.id) === String(selectedId)) || null,
    [trials, selectedId],
  );

  useEffect(() => {
    if (selectedId && !selected && trials.length) {
      setSelectedId(null);
    }
  }, [selectedId, selected, trials.length]);

  const selectedParsed = selected ? parseTrialTopic(selected.topic) : null;
  const selectedLead = selectedParsed ? findTrialLead(leads, selectedParsed) : null;
  const selectedGroup = selected ? groupMap[String(selected.group)] : null;
  const selectedCourse = selectedGroup ? courseMap[String(selectedGroup.course)] : null;
  const selectedTeacher = selected ? staffMap[String(selected.teacher)] : null;
  const selectedRoom = selected ? roomMap[String(selected.room)] : null;

  function teacherBusyLabel(teacherId, date, start, end) {
    if (!teacherId || !date || !start || !end) return "";
    const startAt = combineDateTime(date, start).getTime();
    const endAt = combineDateTime(date, end).getTime();
    const conflict = lessons.find((l) => {
      if (String(l.teacher) !== String(teacherId) || l.status === "cancelled") return false;
      const a = new Date(l.starts_at).getTime();
      const b = new Date(l.ends_at).getTime();
      return a < endAt && b > startAt;
    });
    if (conflict) {
      return `Занят ${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}`;
    }
    return "Свободен";
  }

  function teacherBusyForLesson(lesson) {
    if (!lesson?.teacher) return "";
    const startAt = new Date(lesson.starts_at).getTime();
    const endAt = new Date(lesson.ends_at).getTime();
    const conflict = lessons.find((l) => {
      if (String(l.id) === String(lesson.id)) return false;
      if (String(l.teacher) !== String(lesson.teacher) || l.status === "cancelled") return false;
      const a = new Date(l.starts_at).getTime();
      const b = new Date(l.ends_at).getTime();
      return a < endAt && b > startAt;
    });
    if (conflict) {
      return `Ещё занятие ${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}`;
    }
    return "";
  }

  async function markTrialStatus(statusLabel) {
    if (!selected) return;
    const parsed = parseTrialTopic(selected.topic);
    const lead = findTrialLead(leads, parsed);
    setStatusSaving(true);
    setError("");
    try {
      if (lead) {
        await api.post(`/leads/${lead.id}/activities`, {
          kind: "note",
          content: `Пробный урок: ${statusLabel}`,
          occurred_at: new Date().toISOString(),
        });
        if (statusLabel === "Не пришёл") {
          await api.patch(`/leads/${lead.id}`, {
            next_follow_up_at: new Date(Date.now() + 86400000).toISOString(),
          });
        }
      }
      if (statusLabel === "Отменить" || statusLabel === "Перенесено") {
        await api.patch(`/lessons/${selected.id}`, { status: "cancelled" });
      }
      setInfo(`${parsed.name || "Посетитель"}: ${statusLabel === "Отменить" ? "отменено" : statusLabel}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusSaving(false);
    }
  }

  async function submitTrial(event) {
    event.preventDefault();
    setFormError("");
    if (!trialPerson?.full_name?.trim()) {
      setFormError("Выберите, кого записываем на пробный урок.");
      return;
    }
    setSaving(true);
    try {
      const busy = teacherBusyLabel(
        trialForm.teacher,
        trialForm.date,
        trialForm.start_time,
        trialForm.end_time,
      );
      if (busy.startsWith("Занят")) {
        throw new Error(`У преподавателя уже есть занятие в это время. (${busy})`);
      }
      const name = trialPerson.full_name;
      const phone = toApiPhone(trialPerson.phone) || "";
      const created = await api.post("/lessons", {
        group: trialForm.group,
        teacher: trialForm.teacher,
        room: trialForm.room,
        starts_at: combineDateTime(trialForm.date, trialForm.start_time).toISOString(),
        ends_at: combineDateTime(trialForm.date, trialForm.end_time).toISOString(),
        topic: buildTrialTopic({ name, phone, comment: trialForm.comment }),
      });
      setTrialOpen(false);
      setInfo(`Пробный урок записан: ${name}`);
      if (created?.id) setSelectedId(created.id);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const peopleOptions = useMemo(() => {
    const leadOpts = leads
      .filter((l) => !l.converted_student)
      .map((l) => ({
        key: `lead:${l.id}`,
        label: `Лид · ${l.full_name}${l.phone ? ` · ${formatUzPhone(l.phone)}` : ""}`,
        person: { ...l, kind: "lead" },
      }));
    const studentOpts = students
      .filter((s) => s.status === "active")
      .map((s) => ({
        key: `student:${s.id}`,
        label: `Ученик · ${s.full_name}${s.phone ? ` · ${formatUzPhone(s.phone)}` : ""}`,
        person: { ...s, kind: "student" },
      }));
    return [...leadOpts, ...studentOpts];
  }, [leads, students]);

  const staffWithAvailability = staff.map((s) => ({
    ...s,
    _label: `${staffLabel(s)} · ${teacherBusyLabel(
      s.id,
      trialForm.date,
      trialForm.start_time,
      trialForm.end_time,
    )}`,
  }));

  const todayCount = trials.filter((l) => isSameLocalDay(l.starts_at)).length;

  return (
    <div className="reception-page">
      <PageHeader
        title="Пробные уроки"
        subtitle="Запись посетителей и статусы пробных занятий"
        actions={
          <>
            <Button type="button" variant="ghost" onClick={load} disabled={loading}>
              Обновить
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTrialPerson(null);
                setTrialForm((p) => ({
                  ...p,
                  teacher: staff[0]?.id || "",
                  room: rooms[0]?.id || "",
                  group: groups[0]?.id || "",
                }));
                setTrialOpen(true);
              }}
            >
              + Записать на пробный урок
            </Button>
          </>
        }
      />

      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}

      <div className="reception-layout trials-layout">
        <div className="reception-main">
          <section className="reception-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Список</h2>
                <p className="muted reception-panel-sub">
                  Сегодня: {todayCount} · Всего: {trials.length}
                </p>
              </div>
              <Link to={path("")}>Рабочий стол</Link>
            </div>

            <div className="trials-filters" role="tablist" aria-label="Фильтр пробных">
              {[
                ["all", "Все"],
                ["today", "Сегодня"],
                ["upcoming", "Предстоящие"],
                ["past", "Прошедшие"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={filter === value ? "is-active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="muted">Загрузка…</p>
            ) : !filteredTrials.length ? (
              <p className="muted">Пробных занятий нет</p>
            ) : (
              <ul className="reception-list trials-list">
                {filteredTrials.map((lesson) => (
                  <TrialListItem
                    key={lesson.id}
                    lesson={lesson}
                    selected={String(lesson.id) === String(selectedId)}
                    onSelect={(row) => setSelectedId(row.id)}
                    groupMap={groupMap}
                    staffMap={staffMap}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="reception-side">
          <TrialDetailPanel
            lesson={selected}
            group={selectedGroup}
            course={selectedCourse}
            teacher={selectedTeacher}
            room={selectedRoom}
            lead={selectedLead}
            crmPath={path("crm")}
            schedulePath={path("schedule")}
            busy={selected ? teacherBusyForLesson(selected) : ""}
            saving={statusSaving}
            onMarkStatus={markTrialStatus}
            onCancel={() => markTrialStatus("Отменить")}
          />
        </aside>
      </div>

      <TrialLessonSheet
        open={trialOpen}
        form={trialForm}
        setForm={setTrialForm}
        person={trialPerson}
        onPersonChange={setTrialPerson}
        peopleOptions={peopleOptions}
        courses={courses}
        groups={groups}
        staff={staffWithAvailability}
        rooms={rooms}
        saving={saving}
        error={formError}
        onClose={() => setTrialOpen(false)}
        onSubmit={submitTrial}
      />
    </div>
  );
}
