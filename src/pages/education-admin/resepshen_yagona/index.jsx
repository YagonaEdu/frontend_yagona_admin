import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Banner,
  Button,
  SearchInput,
} from "@/components/ui";
import NotificationsSendSheet from "@/pages/education-admin/NotificationsSendSheet";
import { STATUS_LABELS } from "@/constants";
import { api, ApiError, getSession, invalidateApiCache } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import {
  educationSegmentPath,
} from "@/utils/routes";
import {
  formatDay,
  formatTime,
  formatUzPhone,
  formatWhen,
  money,
  results,
  toApiPhone,
  today,
} from "@/utils/format";
import NewVisitorSheet from "./NewVisitorSheet";
import TrialLessonSheet from "./TrialLessonSheet";
import QuickPaymentSheet from "./QuickPaymentSheet";
import QuickStudentSheet from "./QuickStudentSheet";
import StudentQuickCard from "./StudentQuickCard";
import MarkArrivalSheet from "./MarkArrivalSheet";
import TeacherDrawer from "./TeacherDrawer";
import {
  buildTrialTopic,
  combineDateTime,
  digits,
  invoiceBalance,
  isSameLocalDay,
  isTrialLesson,
  parseTrialTopic,
  staffLabel,
} from "./utils";

const EMPTY_VISITOR = {
  full_name: "",
  phone: "",
  parent_name: "",
  parent_phone: "",
  course: "",
  source: "manual",
  stage: "",
  notes: "",
  force: false,
};

const EMPTY_TRIAL = {
  course: "",
  group: "",
  date: today(),
  start_time: "16:00",
  end_time: "17:00",
  teacher: "",
  room: "",
  comment: "",
};

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

async function asList(path) {
  try {
    return results(await api.get(path, { cache: true }));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    return [];
  }
}

function dayRangeIso(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function loadAttendanceForLessons(lessonsData) {
  const now = Date.now();
  const pastToday = lessonsData
    .filter(
      (lesson) =>
        isSameLocalDay(lesson.starts_at) &&
        lesson.status !== "cancelled" &&
        new Date(lesson.starts_at).getTime() < now,
    )
    .slice(0, 8);
  if (!pastToday.length) return {};
  const attEntries = await Promise.all(
    pastToday.map(async (lesson) => {
      try {
        const data = await api.get(`/lessons/${lesson.id}/attendance`, { cache: true });
        return [String(lesson.id), Array.isArray(data) ? data : results(data)];
      } catch {
        return [String(lesson.id), []];
      }
    }),
  );
  return Object.fromEntries(attEntries);
}

export default function ReceptionDashboard() {
  const session = getSession();
  const membership = currentMembership(session);
  const { tenantSlug = "" } = useParams();
  const navigate = useNavigate();
  const currency = membership?.currency || "UZS";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [students, setStudents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [guardianLinks, setGuardianLinks] = useState([]);
  const [attendanceByLesson, setAttendanceByLesson] = useState({});
  const [secondaryLoading, setSecondaryLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState("all"); // all | students | leads | teachers
  const [cardTeacher, setCardTeacher] = useState(null);

  const [visitorOpen, setVisitorOpen] = useState(false);
  const [visitorForm, setVisitorForm] = useState(EMPTY_VISITOR);
  const [visitorSaving, setVisitorSaving] = useState(false);
  const [visitorError, setVisitorError] = useState("");
  const [createdLead, setCreatedLead] = useState(null);

  const [trialOpen, setTrialOpen] = useState(false);
  const [trialForm, setTrialForm] = useState(EMPTY_TRIAL);
  const [trialPerson, setTrialPerson] = useState(null);
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialError, setTrialError] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payStudentId, setPayStudentId] = useState("");
  const [studentCreateOpen, setStudentCreateOpen] = useState(false);
  const [cardStudent, setCardStudent] = useState(null);
  const [arriveStudent, setArriveStudent] = useState(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [convertLead, setConvertLead] = useState(null);
  const [convertGroup, setConvertGroup] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const [contactTab, setContactTab] = useState("today");

  const userFirstName =
    session.user?.first_name ||
    String(session.user?.name || "")
      .trim()
      .split(/\s+/)[0] ||
    "коллега";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { from, to } = dayRangeIso();
    let lessonsData = [];

    try {
      const core = await Promise.all([
        asList(
          `/lessons?page_size=60&ordering=starts_at&starts_at_from=${encodeURIComponent(from)}&starts_at_to=${encodeURIComponent(to)}`,
        ),
        asList("/leads?page_size=120&ordering=-updated_at"),
        asList("/lead-stages?page_size=30"),
        asList("/groups?page_size=80"),
        asList("/courses?page_size=80"),
        asList("/staff?page_size=80"),
        asList("/rooms?page_size=40"),
      ]);
      lessonsData = core[0];
      setLessons(core[0]);
      setLeads(core[1]);
      setStages(core[2]);
      setGroups(core[3]);
      setCourses(core[4]);
      setStaff(core[5]);
      setRooms(core[6]);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return;
    } finally {
      setLoading(false);
    }

    setSecondaryLoading(true);
    try {
      const [studentsData, enrollmentsData, invoicesData, guardiansData, linksData] =
        await Promise.all([
          asList("/students?page_size=150"),
          asList("/enrollments?page_size=300"),
          asList("/invoices?page_size=120"),
          asList("/guardians?page_size=120"),
          asList("/student-guardians?page_size=300"),
        ]);
      setStudents(studentsData);
      setEnrollments(enrollmentsData);
      setInvoices(invoicesData);
      setGuardians(guardiansData);
      setGuardianLinks(linksData);

      const attendance = await loadAttendanceForLessons(lessonsData);
      setAttendanceByLesson(attendance);
    } catch (err) {
      setError((prev) => prev || err.message);
    } finally {
      setSecondaryLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, session.tenantId]);

  useEffect(() => {
    if (!visitorForm.stage && stages.length) {
      const preferred =
        stages.find((s) => /trial|проб/i.test(s.name)) ||
        stages.find((s) => /new|нов/i.test(s.name)) ||
        stages[0];
      if (preferred) setVisitorForm((p) => ({ ...p, stage: preferred.id }));
    }
  }, [stages, visitorForm.stage]);

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [String(c.id), c])),
    [courses],
  );
  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((g) => [String(g.id), g])),
    [groups],
  );
  const staffMap = useMemo(
    () => Object.fromEntries(staff.map((s) => [String(s.id), s])),
    [staff],
  );
  const guardianMap = useMemo(
    () => Object.fromEntries(guardians.map((g) => [String(g.id), g])),
    [guardians],
  );

  function studentGroups(studentId) {
    return enrollments
      .filter((e) => String(e.student) === String(studentId) && e.status === "active")
      .map((e) => groupMap[String(e.group)])
      .filter(Boolean);
  }

  function studentDebt(studentId) {
    return invoices
      .filter((inv) => String(inv.student) === String(studentId))
      .filter((inv) => !["paid", "void", "canceled", "cancelled"].includes(inv.status))
      .reduce((sum, inv) => sum + Math.max(0, invoiceBalance(inv)), 0);
  }

  function studentParent(studentId) {
    const link = guardianLinks.find(
      (l) => String(l.student) === String(studentId) && (l.is_primary || true),
    );
    return link ? guardianMap[String(link.guardian)] : null;
  }

  const lessonsToday = useMemo(
    () =>
      lessons
        .filter((l) => isSameLocalDay(l.starts_at) && l.status !== "cancelled")
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [lessons],
  );

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(search);
    if (!q && !qDigits) return { students: [], leads: [], teachers: [] };

    const studentsHits = students
      .map((s) => {
        const parent = studentParent(s.id);
        const groupsFor = studentGroups(s.id);
        const teacher = groupsFor[0]?.teacher
          ? staff.find((m) => String(m.id) === String(groupsFor[0].teacher))
          : null;
        const hay = [s.full_name, s.phone, s.email, parent?.phone, parent?.full_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const phoneHit =
          qDigits &&
          (digits(s.phone).includes(qDigits) || digits(parent?.phone).includes(qDigits));
        const textHit = q && hay.includes(q);
        if (!phoneHit && !textHit) return null;
        return {
          student: s,
          parent,
          groups: groupsFor,
          teacher,
          debt: studentDebt(s.id),
        };
      })
      .filter(Boolean)
      .slice(0, 10);

    const leadsHits = leads
      .filter((l) => !l.converted_student)
      .filter((l) => {
        const hay = [l.full_name, l.phone, l.email, l.source_details].join(" ").toLowerCase();
        const phoneHit = qDigits && digits(l.phone).includes(qDigits);
        return phoneHit || (q && hay.includes(q));
      })
      .slice(0, 8);

    const teachersHits = staff
      .filter((m) => m.role === "teacher")
      .map((m) => {
        const name = staffLabel(m);
        const phone = m.user?.phone || "";
        const email = m.user?.email || "";
        const teacherGroups = groups.filter((g) => String(g.teacher) === String(m.id));
        const todayLs = lessonsToday.filter((l) => String(l.teacher) === String(m.id));
        const hay = [name, phone, email].join(" ").toLowerCase();
        const phoneHit = qDigits && digits(phone).includes(qDigits);
        if (!(phoneHit || (q && hay.includes(q)))) return null;
        return {
          teacher: {
            ...m,
            name,
            phone,
            email,
            groups: teacherGroups,
            todayLessons: todayLs,
            courseNames: [
              ...new Set(
                teacherGroups
                  .map((g) => courseMap[String(g.course)]?.name)
                  .filter(Boolean),
              ),
            ],
          },
        };
      })
      .filter(Boolean)
      .slice(0, 8);

    return { students: studentsHits, leads: leadsHits, teachers: teachersHits };
  }, [
    search,
    students,
    leads,
    staff,
    groups,
    lessonsToday,
    enrollments,
    invoices,
    guardianLinks,
    guardians,
    courseMap,
  ]);

  const trialsToday = useMemo(
    () => lessonsToday.filter(isTrialLesson),
    [lessonsToday],
  );

  const followToday = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return leads
      .filter((l) => !l.converted_student && l.next_follow_up_at)
      .filter((l) => {
        const d = new Date(l.next_follow_up_at);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at));
  }, [leads]);

  const followOverdue = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return leads
      .filter((l) => !l.converted_student && l.next_follow_up_at)
      .filter((l) => new Date(l.next_follow_up_at) < start)
      .sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at))
      .slice(0, 10);
  }, [leads]);

  const attention = useMemo(() => {
    const items = [];
    followOverdue.slice(0, 4).forEach((l) => {
      items.push({
        id: `lead-${l.id}`,
        title: l.full_name,
        detail: `Просроченный контакт · ${l.phone || ""}`,
        action: "crm",
        lead: l,
      });
    });
    lessonsToday.forEach((lesson) => {
      const expected = enrollments.filter(
        (e) => String(e.group) === String(lesson.group) && e.status === "active",
      ).length;
      const marks = attendanceByLesson[String(lesson.id)] || [];
      if (expected > 0 && marks.length === 0 && new Date(lesson.starts_at) < new Date()) {
        items.push({
          id: `att-${lesson.id}`,
          title: groupMap[String(lesson.group)]?.name || "Группа",
          detail: "Посещаемость не отмечена",
          action: "attendance",
          lesson,
        });
      }
    });
    students
      .filter((s) => s.status === "active")
      .forEach((s) => {
        const debt = studentDebt(s.id);
        if (debt >= 100000) {
          items.push({
            id: `debt-${s.id}`,
            title: s.full_name,
            detail: `Долг ${money(debt, currency)}`,
            action: "pay",
            student: s,
          });
        }
      });
    groups.forEach((g) => {
      if (!g.teacher && g.status === "active") {
        items.push({
          id: `noteacher-${g.id}`,
          title: g.name,
          detail: "Преподаватель не назначен",
          action: "groups",
        });
      }
      const active = Number(g.active_students || 0);
      if (g.capacity > 0 && active >= g.capacity) {
        items.push({
          id: `cap-${g.id}`,
          title: g.name,
          detail: `Мест нет · ${active}/${g.capacity}`,
          action: "groups",
        });
      }
    });
    lessonsToday.forEach((lesson) => {
      if (!lesson.teacher) {
        items.push({
          id: `nolessonteacher-${lesson.id}`,
          title: groupMap[String(lesson.group)]?.name || "Занятие",
          detail: `${formatTime(lesson.starts_at)} · преподаватель не назначен`,
          action: "schedule",
        });
      }
    });
    return items.slice(0, 12);
  }, [
    followOverdue,
    lessonsToday,
    enrollments,
    attendanceByLesson,
    students,
    groups,
    invoices,
    currency,
    groupMap,
  ]);

  const teachersToday = useMemo(() => {
    const map = new Map();
    lessonsToday.forEach((lesson) => {
      if (!lesson.teacher) return;
      const id = String(lesson.teacher);
      if (!map.has(id)) {
        const member = staffMap[id];
        map.set(id, {
          id,
          member,
          name: member ? staffLabel(member) : "Преподаватель",
          lessons: [],
          groups: new Set(),
        });
      }
      const row = map.get(id);
      row.lessons.push(lesson);
      const g = groupMap[String(lesson.group)];
      if (g) row.groups.add(g.name);
    });
    return [...map.values()]
      .map((row) => ({
        ...row,
        next: row.lessons.find((l) => new Date(l.starts_at) >= new Date()) || row.lessons[0],
        groupNames: [...row.groups],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [lessonsToday, staffMap, groupMap]);

  const visitorDuplicates = useMemo(() => {
    const phoneDigits = digits(visitorForm.phone);
    if (!phoneDigits) return [];
    const hits = [];
    students.forEach((s) => {
      if (digits(s.phone) === phoneDigits) {
        hits.push({
          kind: "student",
          id: s.id,
          full_name: s.full_name,
          phone: s.phone,
          extra: studentGroups(s.id)[0]?.name || "",
        });
      }
    });
    leads.forEach((l) => {
      if (digits(l.phone) === phoneDigits) {
        hits.push({ kind: "lead", id: l.id, full_name: l.full_name, phone: l.phone });
      }
    });
    return hits;
  }, [visitorForm.phone, students, leads, enrollments, groups]);

  function path(segment) {
    return educationSegmentPath(tenantSlug, segment);
  }

  function openVisitor() {
    setVisitorError("");
    setCreatedLead(null);
    setVisitorForm({
      ...EMPTY_VISITOR,
      stage: stages[0]?.id || "",
    });
    setVisitorOpen(true);
  }

  async function submitVisitor(event) {
    event.preventDefault();
    setVisitorError("");
    if (visitorDuplicates.length && !visitorForm.force) {
      setVisitorError("Найдено совпадение. Откройте существующую запись или отметьте «Продолжить».");
      return;
    }
    setVisitorSaving(true);
    try {
      const courseName = courseMap[String(visitorForm.course)]?.name || "";
      const notesParts = [
        visitorForm.notes.trim(),
        courseName ? `Интерес: ${courseName}` : "",
        visitorForm.parent_name.trim()
          ? `Родитель: ${visitorForm.parent_name.trim()} ${visitorForm.parent_phone.trim()}`
          : "",
      ].filter(Boolean);
      const created = await api.post("/leads", {
        full_name: visitorForm.full_name.trim(),
        phone: toApiPhone(visitorForm.phone),
        source: visitorForm.source,
        stage: visitorForm.stage || stages[0]?.id,
        notes: notesParts.join("\n"),
        source_details: courseName,
      });
      setVisitorOpen(false);
      setCreatedLead(created);
      setInfo(`Посетитель «${created.full_name}» сохранён в CRM`);
      await load();
    } catch (err) {
      setVisitorError(err.message);
    } finally {
      setVisitorSaving(false);
    }
  }

  function openTrialFor(person) {
    const next =
      person?.kind === "blank" || (!person?.full_name && !person?.id) ? null : person;
    setTrialPerson(next);
    setTrialError("");
    setTrialForm({
      ...EMPTY_TRIAL,
      course: next?.course || "",
      teacher: staff.find((s) => s.role === "teacher")?.id || staff[0]?.id || "",
      room: rooms[0]?.id || "",
      group: groups[0]?.id || "",
    });
    setTrialOpen(true);
  }

  const trialPeopleOptions = useMemo(() => {
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

  async function submitTrial(event) {
    event.preventDefault();
    setTrialError("");
    if (!trialPerson?.full_name?.trim()) {
      setTrialError("Выберите, кого записываем на пробный урок.");
      return;
    }
    setTrialSaving(true);
    try {
      const startAt = combineDateTime(trialForm.date, trialForm.start_time).getTime();
      const endAt = combineDateTime(trialForm.date, trialForm.end_time).getTime();
      const conflict = lessons.find((l) => {
        if (String(l.teacher) !== String(trialForm.teacher) || l.status === "cancelled") return false;
        const a = new Date(l.starts_at).getTime();
        const b = new Date(l.ends_at).getTime();
        return a < endAt && b > startAt;
      });
      if (conflict) {
        throw new Error(
          `У преподавателя уже есть занятие в это время (${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}).`,
        );
      }
      const name = trialPerson?.full_name || trialPerson?.name || "Посетитель";
      const phone = toApiPhone(trialPerson?.phone) || "";
      await api.post("/lessons", {
        group: trialForm.group,
        teacher: trialForm.teacher,
        room: trialForm.room,
        starts_at: combineDateTime(trialForm.date, trialForm.start_time).toISOString(),
        ends_at: combineDateTime(trialForm.date, trialForm.end_time).toISOString(),
        topic: buildTrialTopic({ name, phone, comment: trialForm.comment }),
      });
      if (trialPerson?.id && trialPerson?.kind !== "student") {
        const trialStage =
          stages.find((s) => /trial|проб/i.test(s.name)) || null;
        if (trialStage) {
          await api.patch(`/leads/${trialPerson.id}`, { stage: trialStage.id });
        }
        await api.post(`/leads/${trialPerson.id}/activities`, {
          kind: "note",
          content: `Запись на пробный урок ${trialForm.date} ${trialForm.start_time}`,
          occurred_at: new Date().toISOString(),
        });
      }
      setTrialOpen(false);
      setCreatedLead(null);
      setInfo("Пробный урок записан");
      await load();
    } catch (err) {
      setTrialError(err.message);
    } finally {
      setTrialSaving(false);
    }
  }

  async function markTrialStatus(lesson, statusLabel) {
    const parsed = parseTrialTopic(lesson.topic);
    const lead = leads.find(
      (l) =>
        (parsed.phone && digits(l.phone) === digits(parsed.phone)) ||
        (parsed.name && l.full_name === parsed.name),
    );
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
      if (statusLabel === "Перенесено") {
        await api.patch(`/lessons/${lesson.id}`, { status: "cancelled" });
      }
      setInfo(`${parsed.name || "Посетитель"}: ${statusLabel}`);
      await load();
      if (statusLabel === "Записался" && lead) {
        setConvertLead(lead);
        setConvertGroup(String(lesson.group || ""));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function doConvert() {
    if (!convertLead) return;
    setConvertBusy(true);
    setError("");
    try {
      const body = convertGroup ? { group: convertGroup } : {};
      const student = await api.post(`/leads/${convertLead.id}/convert`, body);
      setInfo(`Лид конвертирован в ученика «${student.full_name || convertLead.full_name}»`);
      setConvertLead(null);
      await load();
      if (student?.id) {
        const full = students.find((s) => String(s.id) === String(student.id)) || student;
        setCardStudent(full);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setConvertBusy(false);
    }
  }

  async function completeFollowUp(lead) {
    try {
      await api.post(`/leads/${lead.id}/activities`, {
        kind: "call",
        content: "Контакт выполнен (ресепшн)",
        occurred_at: new Date().toISOString(),
      });
      await api.patch(`/leads/${lead.id}`, { next_follow_up_at: null });
      setInfo(`Контакт с ${lead.full_name} отмечен`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="reception-page">
      <section className="reception-hero">
        <div className="reception-hero-copy">
          <p className="reception-hero-eyebrow">{formatDay(new Date())}</p>
          <h1>
            {greetingForNow()}, {userFirstName}
          </h1>
          <p className="muted">
            {membership?.tenant_name || tenantSlug} · рабочий стол ресепшн
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            invalidateApiCache(session.tenantId);
            load();
          }}
          disabled={loading || secondaryLoading}
        >
          {loading || secondaryLoading ? "Обновление…" : "Обновить"}
        </Button>
      </section>

      <section className="reception-stats" aria-label="Сводка на сегодня">
        <article className="reception-stat">
          <span className="reception-stat-label">Занятия</span>
          <strong>{loading ? "—" : lessonsToday.length}</strong>
          <span className="muted">сегодня</span>
        </article>
        <article className="reception-stat">
          <span className="reception-stat-label">Контакты</span>
          <strong>{loading ? "—" : followToday.length}</strong>
          <span className="muted">нужно связаться</span>
        </article>
        <article className="reception-stat">
          <span className="reception-stat-label">Пробные</span>
          <strong>{loading ? "—" : trialsToday.length}</strong>
          <span className="muted">записей</span>
        </article>
        <article className={`reception-stat${attention.length ? " is-warn" : ""}`}>
          <span className="reception-stat-label">Внимание</span>
          <strong>{loading && !secondaryLoading ? "—" : attention.length}</strong>
          <span className="muted">{attention.length ? "нужно решить" : "всё спокойно"}</span>
        </article>
      </section>

      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}

      <section className="reception-quick">
        <div className="reception-quick-head">
          <h2>Что сделать сейчас</h2>
          <p className="muted">Частые действия на ресепшн</p>
        </div>
        <div className="reception-quick-grid">
          <button type="button" className="reception-quick-btn is-primary" onClick={openVisitor}>
            <span className="reception-quick-title">Новый посетитель</span>
            <span className="reception-quick-desc">Записать лид в CRM</span>
          </button>
          <button
            type="button"
            className="reception-quick-btn"
            onClick={() => {
              setPayStudentId("");
              setPayOpen(true);
            }}
          >
            <span className="reception-quick-title">Принять оплату</span>
            <span className="reception-quick-desc">Оплата ученика</span>
          </button>
          <button
            type="button"
            className="reception-quick-btn"
            onClick={() => openTrialFor({ full_name: "", phone: "", kind: "blank" })}
          >
            <span className="reception-quick-title">Пробный урок</span>
            <span className="reception-quick-desc">Запись на пробное</span>
          </button>
          <button
            type="button"
            className="reception-quick-btn"
            onClick={() => {
              setSearchTab("students");
              setSearchOpen(true);
              setSearch("");
            }}
          >
            <span className="reception-quick-title">Найти ученика</span>
            <span className="reception-quick-desc">Поиск по базе</span>
          </button>
        </div>
        <details className="reception-more">
          <summary>Другие действия</summary>
          <div className="reception-more-grid">
            <button type="button" className="reception-more-btn" onClick={() => setStudentCreateOpen(true)}>
              Добавить ученика
            </button>
            <button
              type="button"
              className="reception-more-btn"
              onClick={() => {
                setSearchTab("teachers");
                setSearchOpen(true);
                setSearch("");
              }}
            >
              Найти преподавателя
            </button>
            <button type="button" className="reception-more-btn" onClick={() => setNotifyOpen(true)}>
              Отправить уведомление
            </button>
            <Link className="reception-more-btn" to={path("crm")}>
              Открыть CRM
            </Link>
            <Link className="reception-more-btn" to={path("tasks")}>
              Все задачи
            </Link>
          </div>
        </details>
      </section>

      <section className="reception-search-bar">
        <label className="reception-search-label" htmlFor="reception-search">
          Быстрый поиск
        </label>
        <SearchInput
          id="reception-search"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Имя, телефон, email ученика, лида или преподавателя"
          aria-label="Быстрый поиск"
        />
        {searchOpen && search.trim() ? (
          <div className="reception-search-results">
            <div className="reception-search-tabs">
              {[
                ["all", "Все"],
                ["students", "Ученики"],
                ["leads", "Лиды"],
                ["teachers", "Преподаватели"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={searchTab === id ? "is-active" : ""}
                  onClick={() => setSearchTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!searchHits.students.length &&
            !searchHits.leads.length &&
            !searchHits.teachers.length ? (
              <p className="muted">Ничего не найдено</p>
            ) : null}

            {(searchTab === "all" || searchTab === "students") &&
              searchHits.students.map(({ student, parent, groups: gList, teacher, debt }) => (
                <div key={`s-${student.id}`} className="reception-search-row">
                  <div>
                    <strong>{student.full_name}</strong>
                    <p className="muted">
                      Ученик · {student.phone ? formatUzPhone(student.phone) : "—"}
                      {parent?.phone ? ` · род. ${formatUzPhone(parent.phone)}` : ""}
                      {" · "}
                      {gList.map((g) => g.name).join(", ") || "без группы"}
                      {teacher ? ` · ${staffLabel(teacher)}` : ""}
                      {" · "}
                      {STATUS_LABELS[student.status] || student.status}
                      {debt > 0 ? ` · долг ${money(debt, currency)}` : ""}
                    </p>
                  </div>
                  <div className="reception-search-actions">
                    <Button type="button" onClick={() => setCardStudent(student)}>
                      Открыть
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPayStudentId(String(student.id));
                        setPayOpen(true);
                      }}
                    >
                      Оплата
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setArriveStudent(student)}>
                      Приход
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setNotifyOpen(true)}>
                      Уведомление
                    </Button>
                  </div>
                </div>
              ))}

            {(searchTab === "all" || searchTab === "leads") &&
              searchHits.leads.map((lead) => (
                <div key={`l-${lead.id}`} className="reception-search-row">
                  <div>
                    <strong>{lead.full_name}</strong>
                    <p className="muted">
                      Лид · {lead.phone ? formatUzPhone(lead.phone) : "—"}
                      {lead.source_details ? ` · ${lead.source_details}` : ""}
                    </p>
                  </div>
                  <div className="reception-search-actions">
                    {lead.phone ? (
                      <a className="button-link" href={`tel:${lead.phone}`}>
                        Позвонить
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => openTrialFor({ ...lead, kind: "lead" })}
                    >
                      Пробный
                    </Button>
                    <Link className="button-link" to={path("crm")}>
                      CRM
                    </Link>
                  </div>
                </div>
              ))}

            {(searchTab === "all" || searchTab === "teachers") &&
              searchHits.teachers.map(({ teacher }) => (
                <div key={`t-${teacher.id}`} className="reception-search-row">
                  <div>
                    <strong>{teacher.name}</strong>
                    <p className="muted">
                      Преподаватель · {teacher.phone ? formatUzPhone(teacher.phone) : "—"}
                      {teacher.courseNames?.length
                        ? ` · ${teacher.courseNames.join(" / ")}`
                        : ""}
                      {` · ${teacher.groups?.length || 0} групп`}
                      {` · сегодня ${teacher.todayLessons?.length || 0}`}
                    </p>
                  </div>
                  <div className="reception-search-actions">
                    <Button type="button" onClick={() => setCardTeacher(teacher)}>
                      Открыть
                    </Button>
                    <Link className="button-link" to={path("groups")}>
                      Группы
                    </Link>
                    <Link
                      className="button-link"
                      to={`${path("schedule")}?teacher=${encodeURIComponent(teacher.id)}`}
                    >
                      Расписание
                    </Link>
                    {teacher.phone ? (
                      <a className="button-link" href={`tel:${teacher.phone}`}>
                        Позвонить
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {createdLead ? (
        <section className="reception-panel reception-next">
          <h2>Что сделать дальше?</h2>
          <p className="muted">
            {createdLead.full_name} · {createdLead.phone}
          </p>
          <div className="reception-next-actions">
            <Button
              type="button"
              onClick={() =>
                openTrialFor({
                  ...createdLead,
                  kind: "lead",
                  course: visitorForm.course,
                })
              }
            >
              Записать на пробный урок
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate(path("crm"))}>
              Выбрать курс / CRM
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                const when = new Date(Date.now() + 3600000).toISOString();
                await api.patch(`/leads/${createdLead.id}`, { next_follow_up_at: when });
                setInfo("Звонок запланирован через час");
                setCreatedLead(null);
                load();
              }}
            >
              Запланировать звонок
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNotifyOpen(true)}>
              Отправить уведомление
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConvertLead(createdLead);
                setConvertGroup("");
              }}
            >
              Создать ученика
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreatedLead(null)}>
              Закрыть
            </Button>
          </div>
        </section>
      ) : null}

      <div className="reception-layout">
        <div className="reception-main">
          <section className={`reception-panel${attention.length ? " is-highlight" : ""}`}>
            <div className="reception-panel-head">
              <div>
                <h2>Требует внимания</h2>
                <p className="muted reception-panel-sub">
                  Просрочки, долги, посещаемость и проблемы расписания
                </p>
              </div>
              <span className={`reception-count${attention.length ? " is-warn" : ""}`}>
                {attention.length}
              </span>
            </div>
            {!attention.length ? (
              <p className="reception-empty">Срочных задач нет — можно работать по плану.</p>
            ) : (
              <ul className="reception-list">
                {attention.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p className="muted">{item.detail}</p>
                    </div>
                    <div className="reception-row-actions">
                      {item.action === "pay" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setPayStudentId(String(item.student.id));
                            setPayOpen(true);
                          }}
                        >
                          Оплата
                        </Button>
                      ) : null}
                      {item.action === "crm" ? (
                        <Link className="button-link" to={path("crm")}>
                          Открыть
                        </Link>
                      ) : null}
                      {item.action === "attendance" ? (
                        <Link className="button-link" to={path("attendance")}>
                          Открыть
                        </Link>
                      ) : null}
                      {item.action === "groups" ? (
                        <Link className="button-link" to={path("groups")}>
                          {item.detail?.includes("Преподаватель") ? "Назначить" : "Открыть"}
                        </Link>
                      ) : null}
                      {item.action === "schedule" ? (
                        <Link className="button-link" to={path("schedule")}>
                          Открыть
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="reception-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Занятия сегодня</h2>
                <p className="muted reception-panel-sub">Расписание и посещаемость на текущий день</p>
              </div>
              <Link to={path("schedule")}>Расписание</Link>
            </div>
            {loading ? (
              <p className="reception-empty">Загрузка занятий…</p>
            ) : !lessonsToday.length ? (
              <p className="reception-empty">Сегодня занятий нет.</p>
            ) : (
              <ul className="reception-list">
                {lessonsToday.map((lesson) => {
                  const g = groupMap[String(lesson.group)];
                  const expected = enrollments.filter(
                    (e) => String(e.group) === String(lesson.group) && e.status === "active",
                  ).length;
                  const marks = attendanceByLesson[String(lesson.id)] || [];
                  const present = marks.filter((m) => ["present", "late"].includes(m.status)).length;
                  const unmarked = Math.max(0, expected - marks.length);
                  const teacher = staffMap[String(lesson.teacher)];
                  return (
                    <li key={lesson.id}>
                      <div>
                        <strong>
                          {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)} · {g?.name || "—"}
                        </strong>
                        <p className="muted">
                          {courseMap[String(g?.course)]?.name || "—"} ·{" "}
                          {teacher ? staffLabel(teacher) : "без преподавателя"} · {expected} уч. · {present}{" "}
                          пришли
                          {unmarked ? ` · ${unmarked} не отмечены` : ""}
                          {isTrialLesson(lesson) ? " · пробный" : ""}
                        </p>
                      </div>
                      <div className="reception-row-actions">
                        <Link className="button-link" to={path("attendance")}>
                          Посещаемость
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="reception-side">
          <section className="reception-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Контакты</h2>
                <p className="muted reception-panel-sub">Кому позвонить или написать</p>
              </div>
              <Link to={path("tasks")}>Все</Link>
            </div>
            <div className="reception-tabs">
              <button
                type="button"
                className={contactTab === "today" ? "is-active" : ""}
                onClick={() => setContactTab("today")}
              >
                Сегодня ({followToday.length})
              </button>
              <button
                type="button"
                className={contactTab === "overdue" ? "is-active" : ""}
                onClick={() => setContactTab("overdue")}
              >
                Просрочено ({followOverdue.length})
              </button>
            </div>
            {contactTab === "today" ? (
              !followToday.length ? (
                <p className="reception-empty">На сегодня контактов нет.</p>
              ) : (
                <ul className="reception-list">
                  {followToday.map((lead) => (
                    <li key={lead.id}>
                      <div>
                        <strong>{lead.full_name}</strong>
                        <p className="muted">
                          {lead.phone || "—"} · {formatWhen(lead.next_follow_up_at)}
                        </p>
                      </div>
                      <div className="reception-row-actions">
                        {lead.phone ? (
                          <a className="button-link" href={`tel:${lead.phone}`}>
                            Позвонить
                          </a>
                        ) : null}
                        <Button type="button" size="sm" variant="ghost" onClick={() => completeFollowUp(lead)}>
                          Готово
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : !followOverdue.length ? (
              <p className="reception-empty">Просроченных контактов нет.</p>
            ) : (
              <ul className="reception-list">
                {followOverdue.map((lead) => (
                  <li key={lead.id}>
                    <div>
                      <strong>{lead.full_name}</strong>
                      <p className="muted">
                        {lead.phone || "—"} · было {formatWhen(lead.next_follow_up_at)}
                      </p>
                    </div>
                    <div className="reception-row-actions">
                      {lead.phone ? (
                        <a className="button-link" href={`tel:${lead.phone}`}>
                          Позвонить
                        </a>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => completeFollowUp(lead)}>
                        Готово
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="reception-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Пробные сегодня</h2>
                <p className="muted reception-panel-sub">Отметьте приход или перенос</p>
              </div>
              <span className="reception-count">{trialsToday.length}</span>
            </div>
            {!trialsToday.length ? (
              <p className="reception-empty">Пробных занятий нет.</p>
            ) : (
              <ul className="reception-list">
                {trialsToday.map((lesson) => {
                  const parsed = parseTrialTopic(lesson.topic);
                  return (
                    <li key={lesson.id}>
                      <div>
                        <strong>
                          {formatTime(lesson.starts_at)} · {parsed.name || "Посетитель"}
                        </strong>
                        <p className="muted">{parsed.phone || "—"}</p>
                      </div>
                      <div className="reception-row-actions">
                        <Button type="button" size="sm" onClick={() => markTrialStatus(lesson, "Пришёл")}>
                          Пришёл
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => markTrialStatus(lesson, "Не пришёл")}
                        >
                          Не пришёл
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="reception-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Преподаватели</h2>
                <p className="muted reception-panel-sub">Кто ведёт занятия сегодня</p>
              </div>
              <Link to={path("teachers")}>Все</Link>
            </div>
            {!teachersToday.length ? (
              <p className="reception-empty">Сегодня никто не ведёт занятия.</p>
            ) : (
              <ul className="reception-list reception-list-compact">
                {teachersToday.slice(0, 6).map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <p className="muted">
                        {row.lessons.length} занятия
                        {row.next ? ` · след. ${formatTime(row.next.starts_at)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {secondaryLoading ? (
        <p className="muted reception-loading">Загружаем учеников, долги и детали…</p>
      ) : null}

      {/* legacy grid removed — panels above */}
      <div className="reception-grid reception-grid-hidden" hidden aria-hidden="true">
          {!trialsToday.length ? (
            <p className="muted">На сегодня пробных нет</p>
          ) : (
            <ul className="reception-list">
              {trialsToday.map((lesson) => {
                const parsed = parseTrialTopic(lesson.topic);
                return (
                  <li key={lesson.id}>
                    <div>
                      <strong>
                        {formatTime(lesson.starts_at)} · {parsed.name || "Посетитель"}
                      </strong>
                      <p className="muted">
                        {parsed.phone || "—"} · {groupMap[String(lesson.group)]?.name || "—"} ·{" "}
                        {staffMap[String(lesson.teacher)]
                          ? staffLabel(staffMap[String(lesson.teacher)])
                          : "—"}
                      </p>
                    </div>
                    <div className="reception-row-actions">
                      <Button type="button" size="sm" onClick={() => markTrialStatus(lesson, "Пришёл")}>
                        Пришёл
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => markTrialStatus(lesson, "Не пришёл")}
                      >
                        Не пришёл
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => markTrialStatus(lesson, "Перенесено")}
                      >
                        Перенести
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => markTrialStatus(lesson, "Записался")}
                      >
                        В группу
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Занятия сегодня</h2>
            <Link to={path("schedule")}>Расписание</Link>
          </div>
          {!lessonsToday.length ? (
            <p className="muted">Сегодня занятий нет</p>
          ) : (
            <ul className="reception-list">
              {lessonsToday.map((lesson) => {
                const g = groupMap[String(lesson.group)];
                const expected = enrollments.filter(
                  (e) => String(e.group) === String(lesson.group) && e.status === "active",
                ).length;
                const marks = attendanceByLesson[String(lesson.id)] || [];
                const present = marks.filter((m) => ["present", "late"].includes(m.status)).length;
                const unmarked = Math.max(0, expected - marks.length);
                const teacher = staffMap[String(lesson.teacher)];
                return (
                  <li key={lesson.id}>
                    <div>
                      <strong>
                        {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)} · {g?.name || "—"}
                      </strong>
                      <p className="muted">
                        {courseMap[String(g?.course)]?.name || "—"} ·{" "}
                        {teacher ? staffLabel(teacher) : "без преподавателя"} · {expected} уч. ·{" "}
                        {present} пришли · {unmarked} не отмечены
                        {isTrialLesson(lesson) ? " · пробный" : ""}
                      </p>
                    </div>
                    <div className="reception-row-actions">
                      <Link className="button-link" to={path("attendance")}>
                        Посещаемость
                      </Link>
                      <Link className="button-link" to={path("groups")}>
                        Группа
                      </Link>
                      {teacher ? (
                        <button
                          type="button"
                          className="button-link"
                          onClick={() =>
                            setCardTeacher({
                              ...teacher,
                              name: staffLabel(teacher),
                              phone: teacher.user?.phone || "",
                              email: teacher.user?.email || "",
                              groups: groups.filter((gg) => String(gg.teacher) === String(teacher.id)),
                              todayLessons: lessonsToday.filter(
                                (l) => String(l.teacher) === String(teacher.id),
                              ),
                              courseNames: [
                                ...new Set(
                                  groups
                                    .filter((gg) => String(gg.teacher) === String(teacher.id))
                                    .map((gg) => courseMap[String(gg.course)]?.name)
                                    .filter(Boolean),
                                ),
                              ],
                            })
                          }
                        >
                          Преподаватель
                        </button>
                      ) : null}
                      <Link className="button-link" to={path("schedule")}>
                        Расписание
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Преподаватели сегодня</h2>
            <Link to={path("teachers")}>Все</Link>
          </div>
          {!teachersToday.length ? (
            <p className="muted">Сегодня никто не ведёт занятия</p>
          ) : (
            <ul className="reception-list">
              {teachersToday.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    <p className="muted">
                      {row.lessons.length} занятия
                      {row.next
                        ? ` · следующее: ${formatTime(row.next.starts_at)} · ${
                            groupMap[String(row.next.group)]?.name || "—"
                          }`
                        : ""}
                      {row.groupNames.length ? ` · ${row.groupNames.slice(0, 3).join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="reception-row-actions">
                    <button
                      type="button"
                      className="button-link"
                      onClick={() =>
                        setCardTeacher({
                          ...(row.member || {}),
                          id: row.id,
                          name: row.name,
                          phone: row.member?.user?.phone || "",
                          email: row.member?.user?.email || "",
                          groups: groups.filter((g) => String(g.teacher) === String(row.id)),
                          todayLessons: row.lessons,
                          courseNames: [
                            ...new Set(
                              groups
                                .filter((g) => String(g.teacher) === String(row.id))
                                .map((g) => courseMap[String(g.course)]?.name)
                                .filter(Boolean),
                            ),
                          ],
                        })
                      }
                    >
                      Открыть
                    </button>
                    <Link
                      className="button-link"
                      to={`${path("schedule")}?teacher=${encodeURIComponent(row.id)}`}
                    >
                      Расписание
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Связаться сегодня</h2>
            <Link to={path("tasks")}>Все задачи</Link>
          </div>
          {!followToday.length ? (
            <p className="muted">На сегодня контактов нет</p>
          ) : (
            <ul className="reception-list">
              {followToday.map((lead) => (
                <li key={lead.id}>
                  <div>
                    <strong>{lead.full_name}</strong>
                    <p className="muted">
                      {lead.phone || "—"} · {formatWhen(lead.next_follow_up_at)}
                      {lead.source_details ? ` · ${lead.source_details}` : ""}
                    </p>
                  </div>
                  <div className="reception-row-actions">
                    {lead.phone ? (
                      <a className="button-link" href={`tel:${lead.phone}`}>
                        Позвонить
                      </a>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => completeFollowUp(lead)}>
                      Готово
                    </Button>
                    <Link className="button-link" to={path("crm")}>
                      CRM
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Требует внимания</h2>
            <span className="muted">{attention.length}</span>
          </div>
          {!attention.length ? (
            <p className="muted">Срочных задач нет</p>
          ) : (
            <ul className="reception-list">
              {attention.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.detail}</p>
                  </div>
                  <div className="reception-row-actions">
                    {item.action === "pay" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setPayStudentId(String(item.student.id));
                          setPayOpen(true);
                        }}
                      >
                        Оплата
                      </Button>
                    ) : null}
                    {item.action === "crm" ? (
                      <Link className="button-link" to={path("crm")}>
                        Открыть
                      </Link>
                    ) : null}
                    {item.action === "attendance" ? (
                      <Link className="button-link" to={path("attendance")}>
                        Открыть
                      </Link>
                    ) : null}
                    {item.action === "groups" ? (
                      <Link className="button-link" to={path("groups")}>
                        {item.detail?.includes("Преподаватель") ? "Назначить" : "Открыть"}
                      </Link>
                    ) : null}
                    {item.action === "schedule" ? (
                      <Link className="button-link" to={path("schedule")}>
                        Открыть
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Просроченные контакты</h2>
            <span className="status overdue">{followOverdue.length}</span>
          </div>
          {!followOverdue.length ? (
            <p className="muted">Просрочек нет</p>
          ) : (
            <ul className="reception-list">
              {followOverdue.map((lead) => (
                <li key={lead.id}>
                  <div>
                    <strong>{lead.full_name}</strong>
                    <p className="muted">
                      {lead.phone || "—"} · было {formatWhen(lead.next_follow_up_at)}
                    </p>
                  </div>
                  <div className="reception-row-actions">
                    {lead.phone ? <a className="button-link" href={`tel:${lead.phone}`}>Позвонить</a> : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => completeFollowUp(lead)}>
                      Готово
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {loading ? <p className="muted reception-loading">Загрузка рабочего стола…</p> : null}
      {secondaryLoading ? (
        <p className="muted reception-loading">Обновление учеников и должников…</p>
      ) : null}

      <NewVisitorSheet
        open={visitorOpen}
        form={visitorForm}
        setForm={setVisitorForm}
        courses={courses}
        stages={stages}
        duplicates={visitorDuplicates}
        saving={visitorSaving}
        error={visitorError}
        onClose={() => setVisitorOpen(false)}
        onSubmit={submitVisitor}
        onOpenExisting={(item) => {
          setVisitorOpen(false);
          if (item.kind === "student") {
            const s = students.find((row) => String(row.id) === String(item.id));
            if (s) setCardStudent(s);
          } else {
            navigate(path("crm"));
          }
        }}
      />

      <TrialLessonSheet
        open={trialOpen}
        form={trialForm}
        setForm={setTrialForm}
        person={trialPerson}
        onPersonChange={setTrialPerson}
        peopleOptions={trialPeopleOptions}
        courses={courses}
        groups={groups}
        staff={staff
          .filter((s) => s.role === "teacher")
          .map((s) => {
            let avail = "Свободен";
            if (trialForm.date && trialForm.start_time && trialForm.end_time) {
              const startAt = combineDateTime(trialForm.date, trialForm.start_time).getTime();
              const endAt = combineDateTime(trialForm.date, trialForm.end_time).getTime();
              const conflict = lessons.find((l) => {
                if (String(l.teacher) !== String(s.id) || l.status === "cancelled") return false;
                const a = new Date(l.starts_at).getTime();
                const b = new Date(l.ends_at).getTime();
                return a < endAt && b > startAt;
              });
              if (conflict) {
                avail = `Занят ${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}`;
              }
            }
            return { ...s, _label: `${staffLabel(s)} · ${avail}` };
          })}
        rooms={rooms}
        saving={trialSaving}
        error={trialError}
        onClose={() => setTrialOpen(false)}
        onSubmit={submitTrial}
      />

      <QuickPaymentSheet
        key={`pay-${payOpen}-${payStudentId}`}
        open={payOpen}
        students={students}
        invoices={invoices}
        currency={currency}
        preselectStudentId={payStudentId}
        onClose={() => setPayOpen(false)}
        onSuccess={(msg) => {
          setInfo(msg);
          load();
        }}
      />

      <QuickStudentSheet
        open={studentCreateOpen}
        courses={courses}
        groups={groups}
        staff={staff}
        students={students}
        leads={leads}
        onClose={() => setStudentCreateOpen(false)}
        onCreated={(student, action) => {
          load();
          if (action === "pay") {
            setStudentCreateOpen(false);
            setPayStudentId(String(student.id));
            setPayOpen(true);
          } else if (action === "open") {
            setStudentCreateOpen(false);
            setCardStudent(student);
          }
        }}
      />

      <StudentQuickCard
        open={Boolean(cardStudent)}
        student={cardStudent}
        groupName={cardStudent ? studentGroups(cardStudent.id)[0]?.name : ""}
        courseName={
          cardStudent
            ? courseMap[String(studentGroups(cardStudent.id)[0]?.course)]?.name
            : ""
        }
        teacherName={
          cardStudent
            ? staffLabel(staffMap[String(studentGroups(cardStudent.id)[0]?.teacher)])
            : ""
        }
        parent={cardStudent ? studentParent(cardStudent.id) : null}
        debt={cardStudent ? studentDebt(cardStudent.id) : 0}
        currency={currency}
        recentAttendance={[]}
        onClose={() => setCardStudent(null)}
        onEdit={() => navigate(path("students"))}
        onPay={() => {
          setPayStudentId(String(cardStudent.id));
          setPayOpen(true);
        }}
        onArrive={() => setArriveStudent(cardStudent)}
        onNotify={() => setNotifyOpen(true)}
        onFullProfile={() => navigate(path("students"))}
      />

      <TeacherDrawer
        open={Boolean(cardTeacher)}
        teacher={cardTeacher}
        courses={courses}
        onClose={() => setCardTeacher(null)}
        schedulePath={
          cardTeacher
            ? `${path("schedule")}?teacher=${encodeURIComponent(cardTeacher.id)}`
            : path("schedule")
        }
        groupsPath={path("groups")}
      />

      <MarkArrivalSheet
        open={Boolean(arriveStudent)}
        student={arriveStudent}
        lessons={lessons}
        groups={groups}
        enrollments={enrollments}
        onClose={() => setArriveStudent(null)}
        onSaved={(msg) => {
          setInfo(msg);
          load();
        }}
      />

      <NotificationsSendSheet
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        onSent={() => {
          setNotifyOpen(false);
          setInfo("Уведомление отправлено");
        }}
        tenantName={membership?.tenant_name || tenantSlug}
        students={students}
        groups={groups}
        courses={courses}
        enrollments={enrollments}
      />

      {convertLead ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Конвертация">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setConvertLead(null)}
          />
          <div className="sheet reception-sheet">
            <div className="sheet-head">
              <div>
                <h2>Создать ученика из лида</h2>
                <p className="muted">
                  {convertLead.full_name} · {convertLead.phone}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setConvertLead(null)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <label className="field">
                <span>Группа (необязательно)</span>
                <select value={convertGroup} onChange={(e) => setConvertGroup(e.target.value)}>
                  <option value="">Без группы</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="sheet-foot">
              <Button type="button" variant="ghost" onClick={() => setConvertLead(null)}>
                Отмена
              </Button>
              <Button type="button" disabled={convertBusy} onClick={doConvert}>
                {convertBusy ? "…" : "Конвертировать"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
