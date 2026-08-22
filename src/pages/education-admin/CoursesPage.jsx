import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  MoneyInput,
  PageHeader,
  RowActionsMenu,
  StatCard,
  TextAction,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatDate, formatTime, formatWhen, money, normalizePriceDigits, priceToApi, results } from "@/utils/format";

const emptyForm = { name: "", description: "", price: "", currency: "UZS", is_active: true };

function coursePriceLabel(course) {
  return Number(course?.price) > 0 ? money(course.price, course.currency || "UZS") : "—";
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatRuleTime(value) {
  if (!value) return "—";
  const parts = String(value).split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return formatTime(value);
}

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

function staffLabel(staff, id) {
  if (!id) return null;
  const item = staff.find((row) => String(row.id) === String(id));
  if (!item?.user) return null;
  const user = item.user;
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
}

function durationLabel(groups) {
  const starts = groups.map((item) => item.start_date).filter(Boolean).sort();
  const ends = groups.map((item) => item.end_date).filter(Boolean).sort();
  if (!starts.length && !ends.length) return "—";
  const from = starts[0];
  const to = ends[ends.length - 1];
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  if (from) return `с ${formatDate(from)}`;
  if (to) return `до ${formatDate(to)}`;
  return "—";
}

function enrichCourses({ courses, groups, staff, lessons, rules }) {
  const groupsByCourse = {};
  for (const group of groups) {
    (groupsByCourse[group.course] ||= []).push(group);
  }

  return courses.map((course) => {
    const courseGroups = groupsByCourse[course.id] || [];
    const activeGroups = courseGroups.filter((item) => item.status === "active");
    const teacherIds = [...new Set(courseGroups.map((item) => item.teacher).filter(Boolean))];
    const teachers = teacherIds.map((id) => staffLabel(staff, id)).filter(Boolean);
    const groupIds = new Set(courseGroups.map((item) => String(item.id)));
    const courseLessons = lessons
      .filter((item) => groupIds.has(String(item.group)))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    const upcomingLessons = courseLessons.filter(
      (item) => item.starts_at && new Date(item.starts_at) >= new Date(),
    );
    const courseRules = rules.filter((item) => groupIds.has(String(item.group)) && item.is_active);

    return {
      ...course,
      groups: courseGroups,
      group_count: courseGroups.length,
      active_group_count: activeGroups.length,
      student_count: courseGroups.reduce((sum, item) => sum + Number(item.active_students || 0), 0),
      teachers,
      teacher_label: teachers.length ? teachers.join(", ") : "—",
      duration_label: durationLabel(courseGroups),
      start_date: courseGroups.map((item) => item.start_date).filter(Boolean).sort()[0] || null,
      lessons: courseLessons,
      upcoming_lessons: upcomingLessons.slice(0, 6),
      schedule_rules: courseRules,
    };
  });
}

export default function CoursesPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [groupsFilter, setGroupsFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [courseData, groupData, staffData, lessonData, ruleData] = await Promise.all([
        asList("/courses?page_size=100"),
        asList("/groups?page_size=100"),
        optionalList("/staff?page_size=100"),
        optionalList("/lessons?page_size=200&ordering=starts_at"),
        optionalList("/schedule-rules?page_size=200"),
      ]);
      const teachers = staffData.filter((item) => item.role === "teacher");
      setStaff(teachers);
      setCourses(
        enrichCourses({
          courses: courseData,
          groups: groupData,
          staff: teachers,
          lessons: lessonData,
          rules: ruleData,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((course) => {
      if (statusFilter === "active" && !course.is_active) return false;
      if (statusFilter === "inactive" && course.is_active) return false;
      if (teacherFilter) {
        const hasTeacher = course.groups.some(
          (group) => String(group.teacher) === String(teacherFilter),
        );
        if (!hasTeacher) return false;
      }
      if (groupsFilter === "with" && !course.group_count) return false;
      if (groupsFilter === "without" && course.group_count) return false;
      if (!q) return true;
      return [course.name, course.description, course.teacher_label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [courses, query, statusFilter, teacherFilter, groupsFilter]);

  const selected = useMemo(
    () => courses.find((item) => String(item.id) === String(selectedId)) || null,
    [courses, selectedId],
  );

  const stats = useMemo(() => {
    const priced = courses.filter((item) => Number(item.price) > 0);
    return {
      total: courses.length,
      active: courses.filter((item) => item.is_active).length,
      students: courses.reduce((sum, item) => sum + item.student_count, 0),
      avgPrice: priced.length
        ? Math.round(priced.reduce((sum, item) => sum + Number(item.price || 0), 0) / priced.length)
        : null,
    };
  }, [courses]);

  function openCreate() {
    setError("");
    setInfo("");
    setFormError("");
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openCourse(course) {
    setError("");
    setInfo("");
    setFormError("");
    setSelectedId(course.id);
    setEditOpen(false);
    setEditForm(null);
  }

  function openEdit(course = selected) {
    if (!course) return;
    setSelectedId(course.id);
    setFormError("");
    setEditForm({
      name: course.name || "",
      description: course.description || "",
      price: normalizePriceDigits(course.price),
      currency: course.currency || "UZS",
      is_active: Boolean(course.is_active),
    });
    setEditOpen(true);
  }

  function closeCourse() {
    setSelectedId("");
    setEditOpen(false);
    setEditForm(null);
    setFormError("");
  }

  async function createCourse(event) {
    event.preventDefault();
    setFormError("");
    setError("");
    setInfo("");
    const name = form.name.trim();
    if (!name) {
      setFormError("Укажите название курса.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/courses", {
        name,
        description: form.description.trim(),
        price: priceToApi(form.price),
        currency: form.currency || "UZS",
        is_active: form.is_active,
      });
      setCreateOpen(false);
      setForm(emptyForm);
      setInfo(`Курс «${name}» добавлен.`);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCourse(event) {
    event.preventDefault();
    if (!selected || !editForm) return;
    setFormError("");
    setError("");
    setInfo("");
    const name = editForm.name.trim();
    if (!name) {
      setFormError("Укажите название курса.");
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/courses/${selected.id}`, {
        name,
        description: editForm.description.trim(),
        price: priceToApi(editForm.price),
        currency: editForm.currency || "UZS",
        is_active: editForm.is_active,
      });
      setInfo("Курс сохранён.");
      setEditOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(course) {
    if (!canWrite) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await api.patch(`/courses/${course.id}`, { is_active: !course.is_active });
      setInfo(course.is_active ? "Курс архивирован." : "Курс активирован.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateCourse(course) {
    if (!canWrite) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await api.post("/courses", {
        name: `${course.name} (копия)`,
        description: course.description || "",
        price: course.price || "0",
        currency: course.currency || "UZS",
        is_active: false,
      });
      setInfo(`Курс «${course.name}» скопирован.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(course) {
    if (!canWrite || course.group_count > 0) return;
    if (!window.confirm(`Удалить курс «${course.name}»?`)) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await api.del(`/courses/${course.id}`);
      if (String(selectedId) === String(course.id)) closeCourse();
      setInfo("Курс удалён.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function courseMenuItems(course, { includeView = false } = {}) {
    return [
      { label: "Открыть", onClick: () => openCourse(course), hidden: !includeView },
      { label: "Изменить", onClick: () => openEdit(course), hidden: !canWrite },
      {
        label: course.is_active ? "В архив" : "Активировать",
        onClick: () => toggleActive(course),
        hidden: !canWrite,
        disabled: busy,
      },
      { label: "Дублировать", onClick: () => duplicateCourse(course), hidden: !canWrite, disabled: busy },
      {
        label: "Удалить",
        onClick: () => deleteCourse(course),
        hidden: !canWrite || course.group_count > 0,
        danger: true,
        disabled: busy,
      },
    ];
  }

  const hasFilters = query || statusFilter || teacherFilter || groupsFilter;
  const teacherOptions = staff.filter((item) =>
    courses.some((course) => course.groups.some((group) => String(group.teacher) === String(item.id))),
  );

  return (
    <div className="courses-page">
      <PageHeader
        title="Курсы"
        subtitle="Управление курсами учебного центра"
        actions={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              + Добавить курс
            </Button>
          ) : null
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      {!loading && courses.length ? (
        <div className="courses-stats grid cols-4">
          <StatCard label="Всего курсов" value={stats.total} />
          <StatCard label="Активные курсы" value={stats.active} />
          <StatCard label="Всего учеников" value={stats.students} hint="по группам курсов" />
          {stats.avgPrice != null ? (
            <StatCard label="Средняя цена" value={money(stats.avgPrice)} hint="по курсам с ценой" />
          ) : null}
        </div>
      ) : null}

      <div className="crm-toolbar">
        <div className="crm-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию курса…"
          />
          <button
            type="button"
            className={`crm-filter-btn ${filtersOpen ? "is-active" : ""}`}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            Фильтры
          </button>
        </div>
        <div className="crm-toolbar-stats">
          <span>
            показано <strong>{filtered.length}</strong>
          </span>
          <span className="dot" />
          <span>
            всего <strong>{courses.length}</strong>
          </span>
        </div>
      </div>

      {filtersOpen ? (
        <div className="crm-filters">
          <Field label="Статус">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
            </select>
          </Field>
          <Field label="Преподаватель">
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">Все</option>
              {teacherOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {staffLabel(staff, item.id) || item.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Группы">
            <select value={groupsFilter} onChange={(e) => setGroupsFilter(e.target.value)}>
              <option value="">Все курсы</option>
              <option value="with">С группами</option>
              <option value="without">Без групп</option>
            </select>
          </Field>
          <Button type="button" className="secondary compact" busy={loading} onClick={load}>
            Обновить
          </Button>
          {hasFilters ? (
            <Button
              type="button"
              className="secondary compact"
              onClick={() => {
                setQuery("");
                setStatusFilter("");
                setTeacherFilter("");
                setGroupsFilter("");
              }}
            >
              Сбросить
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="card">
          <EmptyState title="Загрузка…" body="Получаем каталог курсов." />
        </div>
      ) : error && !courses.length ? (
        <div className="card">
          <EmptyState
            title="Не удалось загрузить курсы"
            body={error}
            action={
              <Button type="button" className="secondary" onClick={load}>
                Повторить
              </Button>
            }
          />
        </div>
      ) : !courses.length ? (
        <div className="card">
          <EmptyState
            title="Пока нет курсов"
            body="Создайте первый курс, затем добавьте к нему группы и расписание."
            action={
              canWrite ? (
                <Button type="button" onClick={openCreate}>
                  + Добавить курс
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="card courses-table-card">
          <DataTable
            rows={filtered}
            empty={hasFilters ? "Ничего не найдено по фильтрам" : "Курсов пока нет"}
            onRowClick={openCourse}
            columns={[
              {
                key: "name",
                title: "Курс",
                render: (row) => (
                  <div className="courses-cell-main">
                    <button
                      type="button"
                      className="table-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        openCourse(row);
                      }}
                    >
                      {row.name}
                    </button>
                    {row.description ? <div className="muted courses-desc">{row.description}</div> : null}
                  </div>
                ),
              },
              {
                key: "teacher",
                title: "Преподаватели",
                render: (row) => row.teacher_label,
              },
              {
                key: "groups",
                title: "Группы",
                render: (row) => row.group_count || 0,
              },
              {
                key: "students",
                title: "Ученики",
                render: (row) => row.student_count || 0,
              },
              {
                key: "price",
                title: "Цена",
                render: (row) => coursePriceLabel(row),
              },
              {
                key: "duration",
                title: "Период",
                render: (row) => row.duration_label,
              },
              {
                key: "status",
                title: "Статус",
                render: (row) => (
                  <Badge
                    value={row.is_active ? "active" : "inactive"}
                    label={row.is_active ? "активен" : "архив"}
                  />
                ),
              },
              {
                key: "actions",
                title: "",
                stopRowClick: true,
                render: (row) => <RowActionsMenu items={courseMenuItems(row, { includeView: true })} />,
              },
            ]}
          />
        </div>
      )}

      {createOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Новый курс">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setCreateOpen(false)}
          />
          <form className="sheet" onSubmit={createCourse}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Курсы</div>
                <h2>+ Добавить курс</h2>
                <p className="muted">Укажите название, описание и стоимость курса.</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setCreateOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <Banner>{formError}</Banner>
              <div className="grid" style={{ gap: 12 }}>
                <Field label="Название">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Например: IELTS"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Описание">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Программа, уровень, формат"
                  />
                </Field>
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <Field label="Цена">
                    <MoneyInput
                      value={form.price}
                      onChange={(price) => setForm({ ...form, price })}
                    />
                  </Field>
                  <Field label="Валюта">
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    >
                      <option value="UZS">UZS</option>
                      <option value="USD">USD</option>
                    </select>
                  </Field>
                </div>
                <Field label="Статус">
                  <select
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(e) =>
                      setForm({ ...form, is_active: e.target.value === "active" })
                    }
                  >
                    <option value="active">Активен</option>
                    <option value="inactive">Архив</option>
                  </select>
                </Field>
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Сохранить курс
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка курса">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={closeCourse}
          />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Курс</div>
                <h2>{editOpen ? "Изменить курс" : selected.name}</h2>
                <p className="muted">
                  {editOpen ? selected.name : selected.description || "Без описания"}
                </p>
              </div>
              <div className="sheet-head-actions">
                {canWrite && !editOpen ? (
                  <RowActionsMenu items={courseMenuItems(selected)} />
                ) : null}
                <button type="button" className="sheet-close" onClick={closeCourse} aria-label="Закрыть">
                  ×
                </button>
              </div>
            </div>

            <div className="sheet-body">
              {editOpen && editForm ? (
                <form id="course-edit-form" onSubmit={saveCourse}>
                  <Banner>{formError}</Banner>
                  <div className="grid" style={{ gap: 12 }}>
                    <Field label="Название">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                        autoFocus
                      />
                    </Field>
                    <Field label="Описание">
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      />
                    </Field>
                    <div className="grid cols-2" style={{ gap: 12 }}>
                      <Field label="Цена">
                        <MoneyInput
                          value={editForm.price}
                          onChange={(price) => setEditForm({ ...editForm, price })}
                        />
                      </Field>
                      <Field label="Валюта">
                        <select
                          value={editForm.currency}
                          onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                        >
                          <option value="UZS">UZS</option>
                          <option value="USD">USD</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Статус">
                      <select
                        value={editForm.is_active ? "active" : "inactive"}
                        onChange={(e) =>
                          setEditForm({ ...editForm, is_active: e.target.value === "active" })
                        }
                      >
                        <option value="active">Активен</option>
                        <option value="inactive">Архив</option>
                      </select>
                    </Field>
                  </div>
                  <div className="sheet-foot sheet-foot-inline">
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
                    <Button type="submit">Сохранить</Button>
                  </div>
                </form>
              ) : (
                <>
              <div className="detail-badges">
                <Badge
                  value={selected.is_active ? "active" : "inactive"}
                  label={selected.is_active ? "активен" : "архив"}
                />
                <Badge value="scheduled" label={`${selected.group_count} групп`} />
                <Badge value="active" label={`${selected.student_count} учеников`} />
                {Number(selected.price) > 0 ? (
                  <Badge value="paid" label={coursePriceLabel(selected)} />
                ) : null}
              </div>

              <section className="detail-section">
                <h3>О курсе</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Цена</dt>
                    <dd>{coursePriceLabel(selected)}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Преподаватели</dt>
                    <dd>{selected.teacher_label}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Группы</dt>
                    <dd>{selected.group_count}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Ученики</dt>
                    <dd>{selected.student_count}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Период</dt>
                    <dd>{selected.duration_label}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Дата старта</dt>
                    <dd>{formatDate(selected.start_date)}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Создан</dt>
                    <dd>{formatDate(selected.created_at)}</dd>
                  </div>
                </dl>
              </section>

              {selected.groups?.length ? (
                <section className="detail-section">
                  <h3>Группы</h3>
                  <ul className="doc-list">
                    {selected.groups.map((group) => (
                      <li key={group.id}>
                        <div>
                          <strong>{group.name}</strong>
                          <span>
                            {staffLabel(staff, group.teacher) || "без преподавателя"}
                            {group.active_students != null ? ` · ${group.active_students} уч.` : ""}
                          </span>
                        </div>
                        <Badge value={group.status} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selected.schedule_rules?.length ? (
                <section className="detail-section">
                  <h3>Расписание</h3>
                  <ul className="doc-list">
                    {selected.schedule_rules.map((rule) => {
                      const group = selected.groups.find(
                        (item) => String(item.id) === String(rule.group),
                      );
                      return (
                        <li key={rule.id}>
                          <div>
                            <strong>{group?.name || "Группа"}</strong>
                            <span>
                              {WEEKDAYS[rule.weekday] || rule.weekday} {formatRuleTime(rule.starts_at)}–
                              {formatRuleTime(rule.ends_at)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {selected.upcoming_lessons?.length ? (
                <section className="detail-section">
                  <h3>Ближайшие занятия</h3>
                  <ul className="doc-list">
                    {selected.upcoming_lessons.map((lesson) => {
                      const group = selected.groups.find(
                        (item) => String(item.id) === String(lesson.group),
                      );
                      return (
                        <li key={lesson.id}>
                          <div>
                            <strong>{group?.name || "Группа"}</strong>
                            <span>{formatWhen(lesson.starts_at)}</span>
                          </div>
                          <Badge value={lesson.status} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
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
