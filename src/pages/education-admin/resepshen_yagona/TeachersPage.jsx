import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  Field,
  PageHeader,
  PhoneInput,
  SearchInput,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { canManageOperational } from "@/utils/roleAccess";
import { educationSegmentPath } from "@/utils/routes";
import { formatUzPhone, results, toApiPhone } from "@/utils/format";
import { isSameLocalDay, staffLabel } from "./utils";
import TeacherDrawer from "./TeacherDrawer";

async function asList(path) {
  try {
    return results(await api.get(path));
  } catch {
    return [];
  }
}

const STATUS_FILTERS = [
  ["active", "Активные"],
  ["today", "Сегодня работают"],
  ["nogroups", "Без групп"],
  ["inactive", "Неактивные"],
  ["", "Все"],
];

export default function TeachersPage() {
  const { tenantSlug = "" } = useParams();
  const canWrite = canManageOperational(currentMembership()?.role || "");

  const [teachers, setTeachers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [groupFilter, setGroupFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [staffData, groupData, courseData, lessonData, ruleData] = await Promise.all([
        asList("/staff?page_size=200"),
        asList("/groups?page_size=200"),
        asList("/courses?page_size=100"),
        asList("/lessons?page_size=300"),
        asList("/schedule-rules?page_size=300"),
      ]);
      setTeachers(staffData.filter((item) => item.role === "teacher"));
      setGroups(groupData);
      setCourses(courseData);
      setLessons(lessonData);
      setRules(ruleData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [String(c.id), c])),
    [courses],
  );

  const enriched = useMemo(() => {
    return teachers.map((teacher) => {
      const teacherGroups = groups.filter((g) => String(g.teacher) === String(teacher.id));
      const courseIds = [
        ...new Set(teacherGroups.map((g) => String(g.course)).filter(Boolean)),
      ];
      const courseNames = courseIds.map((id) => courseMap[id]?.name).filter(Boolean);
      const todayLessons = lessons
        .filter(
          (l) =>
            String(l.teacher) === String(teacher.id) &&
            isSameLocalDay(l.starts_at) &&
            l.status !== "cancelled",
        )
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      const weekMinutes = rules
        .filter((r) => String(r.teacher) === String(teacher.id) && r.is_active !== false)
        .reduce((sum, r) => {
          if (!r.starts_at || !r.ends_at) return sum;
          const [sh, sm] = String(r.starts_at).split(":").map(Number);
          const [eh, em] = String(r.ends_at).split(":").map(Number);
          if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return sum;
          return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
        }, 0);
      return {
        ...teacher,
        name: staffLabel(teacher),
        phone: teacher.user?.phone || "",
        email: teacher.user?.email || "",
        groups: teacherGroups,
        courseNames,
        todayLessons,
        weekHours: weekMinutes ? Math.round((weekMinutes / 60) * 10) / 10 : 0,
      };
    });
  }, [teachers, groups, lessons, rules, courseMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = query.replace(/\D/g, "");
    return enriched.filter((row) => {
      if (statusFilter === "active" && row.is_active === false) return false;
      if (statusFilter === "inactive" && row.is_active !== false) return false;
      if (statusFilter === "today" && !row.todayLessons.length) return false;
      if (statusFilter === "nogroups" && row.groups.length > 0) return false;
      if (courseFilter && !row.groups.some((g) => String(g.course) === String(courseFilter))) {
        return false;
      }
      if (groupFilter && !row.groups.some((g) => String(g.id) === String(groupFilter))) {
        return false;
      }
      if (!q && !qDigits) return true;
      const hay = [row.name, row.phone, row.email, row.courseNames.join(" ")]
        .join(" ")
        .toLowerCase();
      const phoneHit = qDigits && String(row.phone || "").replace(/\D/g, "").includes(qDigits);
      return hay.includes(q) || phoneHit;
    });
  }, [enriched, query, courseFilter, statusFilter, groupFilter]);

  const stats = useMemo(() => {
    const workingToday = enriched.filter((t) => t.todayLessons.length > 0).length;
    const lessonsToday = lessons.filter(
      (l) => isSameLocalDay(l.starts_at) && l.status !== "cancelled",
    ).length;
    const noTeacher = groups.filter((g) => !g.teacher && g.status === "active").length;
    return { total: enriched.length, workingToday, lessonsToday, noTeacher };
  }, [enriched, lessons, groups]);

  function path(segment, params = "") {
    const base = educationSegmentPath(tenantSlug, segment);
    return params ? `${base}?${params}` : base;
  }

  return (
    <div className="reception-page teachers-page">
      <PageHeader
        title="Преподаватели"
        subtitle="Преподаватели, группы и нагрузка"
        actions={
          <>
            <Button type="button" variant="ghost" onClick={load} disabled={loading}>
              Обновить
            </Button>
            {canWrite ? (
              <Button type="button" onClick={() => setAddOpen(true)}>
                + Добавить преподавателя
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}

      <div className="teachers-stats">
        <div className="teachers-stat">
          <span className="teachers-stat-label">Всего</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="teachers-stat">
          <span className="teachers-stat-label">Сегодня работают</span>
          <strong>{stats.workingToday}</strong>
        </div>
        <div className="teachers-stat">
          <span className="teachers-stat-label">Занятий сегодня</span>
          <strong>{stats.lessonsToday}</strong>
        </div>
        <div className={`teachers-stat${stats.noTeacher ? " is-warn" : ""}`}>
          <span className="teachers-stat-label">Без преподавателя</span>
          <strong>{stats.noTeacher}</strong>
        </div>
      </div>

      <div className="card teachers-toolbar">
        <div className="teachers-toolbar-row">
          <Field label="Поиск">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Имя, телефон, email"
            />
          </Field>
          <Field label="Курс">
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">Все курсы</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Группа">
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="teachers-filters">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              className={statusFilter === value ? "is-active" : ""}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState
          title={loading ? "Загрузка…" : "Преподаватели не найдены"}
          body="Проверьте фильтры или добавьте преподавателя."
        />
      ) : (
        <ul className="teachers-list">
          {filtered.map((row) => (
            <li key={row.id} className={selected?.id === row.id ? "is-selected" : ""}>
              <button type="button" className="teachers-list-btn" onClick={() => setSelected(row)}>
                <Avatar name={row.name} />
                <div className="teachers-list-main">
                  <div className="teachers-list-title">
                    <strong>{row.name}</strong>
                    {row.todayLessons.length ? (
                      <span className="teachers-live-dot" title="Есть занятия сегодня" />
                    ) : null}
                  </div>
                  <p className="muted">
                    {row.phone ? formatUzPhone(row.phone) : "—"}
                    {row.courseNames.length ? ` · ${row.courseNames.join(", ")}` : ""}
                  </p>
                </div>
                <div className="teachers-list-meta">
                  <span>{row.groups.length} групп</span>
                  <span>{row.todayLessons.length} сегодня</span>
                  {row.weekHours ? <span>{row.weekHours} ч/нед</span> : null}
                </div>
                <span className={`status ${row.is_active === false ? "inactive" : "active"}`}>
                  {row.is_active === false ? "Неактивен" : "Активен"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {stats.noTeacher > 0 ? (
        <section className="reception-panel">
          <div className="reception-panel-head">
            <h2>Группы без преподавателя</h2>
            <Link to={path("groups")}>Открыть группы</Link>
          </div>
          <ul className="reception-list">
            {groups
              .filter((g) => !g.teacher && g.status === "active")
              .slice(0, 8)
              .map((g) => (
                <li key={g.id}>
                  <div>
                    <strong>{g.name}</strong>
                    <p className="muted">Преподаватель не назначен</p>
                  </div>
                  <Link className="button-link" to={path("groups")}>
                    Назначить
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <TeacherDrawer
        open={Boolean(selected)}
        teacher={selected}
        courses={courses}
        onClose={() => setSelected(null)}
        schedulePath={
          selected ? path("schedule", `teacher=${encodeURIComponent(selected.id)}`) : path("schedule")
        }
        groupsPath={path("groups")}
      />

      <AddTeacherModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setInfo("Преподаватель добавлен");
          setAddOpen(false);
          load();
        }}
      />
    </div>
  );
}

function AddTeacherModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    password: "StrongPass123",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/staff", {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: toApiPhone(form.phone) || undefined,
        email: form.email.trim() || undefined,
        password: form.password,
        role: "teacher",
        position: "Преподаватель",
      });
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Добавить преподавателя">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Добавить преподавателя</h2>
            <p className="muted">Без доступа к зарплате и HR-данным</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="sheet-body" onSubmit={submit}>
          {error ? <p className="field-message error">{error}</p> : null}
          <div className="form-grid">
            <Field label="Имя *">
              <input
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Фамилия *">
              <input
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Телефон">
              <PhoneInput
                value={form.phone}
                onChange={(phone) => setForm((p) => ({ ...p, phone }))}
              />
            </Field>
            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="Временный пароль">
              <input
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
            </Field>
          </div>
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Добавить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
