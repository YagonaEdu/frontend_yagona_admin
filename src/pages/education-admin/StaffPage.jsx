import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  Field,
  MoneyInput,
  PageHeader,
  RowActionsMenu,
} from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatDate, formatUzPhone, money, priceToApi, results, today } from "@/utils/format";

const PAYMENT_TYPES = [
  { value: "fixed", label: "Фиксированная" },
  { value: "per_lesson", label: "За урок" },
  { value: "hourly", label: "Почасовая" },
];

const ROLE_OPTIONS = [
  { value: "owner", label: "Владелец" },
  { value: "admin", label: "Администратор" },
  { value: "teacher", label: "Преподаватель" },
  { value: "accountant", label: "Бухгалтер" },
];

const KPI_DEFS = [
  { key: "total", label: "Всего сотрудников", tone: "blue", icon: "∑" },
  { key: "teachers", label: "Преподавателей", tone: "green", icon: "T" },
  { key: "admins", label: "Администраторов", tone: "purple", icon: "A" },
  { key: "active", label: "Активных сотрудников", tone: "green", icon: "✓" },
  { key: "payroll", label: "Фонд оплаты за месяц", tone: "blue", icon: "SUM" },
];

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function paymentTypeLabel(value) {
  return PAYMENT_TYPES.find((item) => item.value === value)?.label || "—";
}

function computeAccrued(row) {
  const rate = asNumber(row.salary_rate);
  if (!row.payment_type || !rate) return 0;
  if (row.payment_type === "per_lesson") return rate * (row.lessonCount || 0);
  return rate;
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function staffPatchPayload(data) {
  return {
    role: data.role,
    is_active: data.is_active,
    position: data.position || "",
    hired_on: data.hired_on || null,
    payment_type: data.payment_type || "",
    salary_rate: priceToApi(data.salary_rate || "0"),
    salary_paid_month: priceToApi(data.salary_paid_month || "0"),
    last_payout_at: data.last_payout_at ? new Date(data.last_payout_at).toISOString() : null,
    last_payout_amount: data.last_payout_amount ? priceToApi(data.last_payout_amount) : null,
  };
}

function rolePosition(role) {
  const map = {
    owner: "Владелец",
    admin: "Администратор центра",
    teacher: "Преподаватель",
    accountant: "Бухгалтер",
  };
  return map[role] || ROLE_LABELS[role] || role;
}

function staffName(row) {
  const user = row.user || {};
  return (
    user.name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "—"
  );
}

function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function monthRange(dateStr = today()) {
  const d = new Date(`${dateStr}T12:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

async function fetchAll(path) {
  const items = [];
  let url = path.includes("?") ? `${path}&page_size=200` : `${path}?page_size=200`;
  while (url) {
    const data = await api.get(url);
    items.push(...results(data));
    if (!data.next) break;
    try {
      const next = new URL(data.next, window.location.origin);
      url = `${next.pathname.replace(/^\/api\/v1/, "")}${next.search}`;
    } catch {
      break;
    }
  }
  return items;
}

function RoleBadge({ role }) {
  return <span className={`staff-role staff-role-${role}`}>{ROLE_LABELS[role] || role}</span>;
}

function StatusBadge({ active }) {
  return (
    <span className={`status ${active ? "active" : "inactive"}`}>
      {active ? "Активен" : "Неактивен"}
    </span>
  );
}

export default function StaffPage() {
  const navigate = useNavigate();
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [staff, setStaff] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPaymentType, setFilterPaymentType] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detailTab, setDetailTab] = useState("info");
  const [salaryForm, setSalaryForm] = useState(null);
  const [salarySaving, setSalarySaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [formSaving, setFormSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    phone: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "teacher",
    is_active: true,
    position: "",
    hired_on: "",
    payment_type: "fixed",
    salary_rate: "",
    salary_paid_month: "",
    last_payout_at: "",
    last_payout_amount: "",
  });

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((item) => [String(item.id), item])),
    [courses],
  );

  const monthLessons = useMemo(() => {
    const { from, to } = monthRange();
    return lessons.filter((item) => {
      const day = isoDate(item.starts_at);
      return day >= from && day <= to;
    });
  }, [lessons]);

  const enrichedStaff = useMemo(() => {
    return staff.map((row) => {
      const teacherGroups = groups.filter((item) => String(item.teacher) === String(row.id));
      const lessonCount = monthLessons.filter(
        (item) => String(item.teacher) === String(row.id),
      ).length;
      const courseNames = [
        ...new Set(
          teacherGroups
            .map((item) => courseMap[String(item.course)]?.name)
            .filter(Boolean),
        ),
      ];
      return {
        ...row,
        displayName: staffName(row),
        customPosition: row.position || "",
        position: row.position || rolePosition(row.role),
        groupCount: teacherGroups.length,
        lessonCount,
        groups: teacherGroups,
        courseNames,
        accrued: computeAccrued({ ...row, lessonCount }),
        remaining: Math.max(
          0,
          computeAccrued({ ...row, lessonCount }) - asNumber(row.salary_paid_month),
        ),
      };
    });
  }, [staff, groups, monthLessons, courseMap]);

  const filteredStaff = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return enrichedStaff.filter((row) => {
      if (filterRole && row.role !== filterRole) return false;
      if (filterStatus === "active" && !row.is_active) return false;
      if (filterStatus === "inactive" && row.is_active) return false;
      if (filterPaymentType && row.payment_type !== filterPaymentType) return false;
      if (q) {
        const phone = (row.user?.phone || "").replace(/\D/g, "");
        const hay = `${row.displayName} ${row.user?.email || ""} ${row.user?.phone || ""} ${phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedStaff, filterRole, filterStatus, filterPaymentType, filterSearch]);

  const kpi = useMemo(() => {
    const payroll = enrichedStaff
      .filter((item) => item.is_active)
      .reduce((sum, item) => sum + item.accrued, 0);
    return {
      total: staff.length,
      teachers: staff.filter((item) => item.role === "teacher").length,
      admins: staff.filter((item) => item.role === "admin" || item.role === "owner").length,
      active: staff.filter((item) => item.is_active).length,
      payroll,
    };
  }, [staff, enrichedStaff]);

  const detailRow = useMemo(
    () => enrichedStaff.find((item) => String(item.id) === String(detailId)) || null,
    [enrichedStaff, detailId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [staffData, groupData, courseData, lessonData] = await Promise.all([
        fetchAll("/staff"),
        fetchAll("/groups"),
        fetchAll("/courses"),
        fetchAll("/lessons"),
      ]);
      setStaff(staffData);
      setGroups(groupData);
      setCourses(courseData);
      setLessons(lessonData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!info) return undefined;
    const timer = window.setTimeout(() => setInfo(""), 3200);
    return () => window.clearTimeout(timer);
  }, [info]);

  useEffect(() => {
    if (!detailRow) {
      setSalaryForm(null);
      return;
    }
    setSalaryForm({
      id: detailRow.id,
      role: detailRow.role,
      is_active: detailRow.is_active,
      position: detailRow.customPosition || "",
      hired_on: detailRow.hired_on || "",
      payment_type: detailRow.payment_type || "",
      salary_rate: detailRow.salary_rate ? String(Math.floor(asNumber(detailRow.salary_rate))) : "",
      salary_paid_month: detailRow.salary_paid_month
        ? String(Math.floor(asNumber(detailRow.salary_paid_month)))
        : "",
      last_payout_at: toDatetimeLocal(detailRow.last_payout_at),
      last_payout_amount: detailRow.last_payout_amount
        ? String(Math.floor(asNumber(detailRow.last_payout_amount)))
        : "",
    });
  }, [detailRow]);

  function openCreateModal() {
    setFormMode("create");
    setForm({
      email: "",
      phone: "",
      password: "",
      first_name: "",
      last_name: "",
      role: "teacher",
      is_active: true,
      position: "",
      hired_on: today(),
      payment_type: "fixed",
      salary_rate: "",
      salary_paid_month: "",
      last_payout_at: "",
      last_payout_amount: "",
    });
    setFormOpen(true);
  }

  function openEditModal(row) {
    setFormMode("edit");
    setForm({
      id: row.id,
      email: row.user?.email || "",
      phone: row.user?.phone || "",
      password: "",
      first_name: row.user?.first_name || "",
      last_name: row.user?.last_name || "",
      role: row.role,
      is_active: row.is_active,
      position: row.customPosition || "",
      hired_on: row.hired_on || "",
      payment_type: row.payment_type || "",
      salary_rate: row.salary_rate ? String(Math.floor(asNumber(row.salary_rate))) : "",
      salary_paid_month: row.salary_paid_month
        ? String(Math.floor(asNumber(row.salary_paid_month)))
        : "",
      last_payout_at: toDatetimeLocal(row.last_payout_at),
      last_payout_amount: row.last_payout_amount
        ? String(Math.floor(asNumber(row.last_payout_amount)))
        : "",
    });
    setFormOpen(true);
  }

  async function saveSalary(event) {
    event.preventDefault();
    if (!salaryForm || !canWrite) return;
    setSalarySaving(true);
    setError("");
    try {
      await api.patch(`/staff/${salaryForm.id}`, staffPatchPayload(salaryForm));
      setInfo("Зарплата сохранена.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSalarySaving(false);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    setFormSaving(true);
    setError("");
    try {
      if (formMode === "create") {
        await api.post("/staff", {
          email: form.email,
          phone: form.phone,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          position: form.position,
          hired_on: form.hired_on || null,
          payment_type: form.payment_type,
          salary_rate: priceToApi(form.salary_rate || "0"),
        });
        setInfo("Сотрудник добавлен.");
      } else {
        await api.patch(`/staff/${form.id}`, staffPatchPayload(form));
        setInfo("Данные сотрудника обновлены.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setFormSaving(false);
    }
  }

  async function exportExcel() {
    const { downloadExcel, excelStamp } = await import("@/utils/exportExcel");
    downloadExcel(`staff_${excelStamp()}`, filteredStaff, [
      { key: "name", title: "Сотрудник", value: (row) => row.displayName },
      { key: "position", title: "Должность", value: (row) => row.position },
      { key: "role", title: "Роль", value: (row) => ROLE_LABELS[row.role] || row.role },
      { key: "phone", title: "Телефон", value: (row) => row.user?.phone || "" },
      { key: "email", title: "Email", value: (row) => row.user?.email || "" },
      {
        key: "load",
        title: "Группы / нагрузка",
        value: (row) =>
          row.role === "teacher"
            ? `${row.groupCount} групп / ${row.lessonCount} занятий`
            : "—",
      },
      { key: "status", title: "Статус", value: (row) => (row.is_active ? "Активен" : "Неактивен") },
    ]);
  }

  function openPayroll() {
    const slug = getSession().tenantSlug;
    if (slug) navigate(`/education/${slug}/finance`);
    else navigate("../finance");
  }

  function resetFilters() {
    setFilterSearch("");
    setFilterRole("");
    setFilterStatus("");
    setFilterPaymentType("");
  }

  function openStaffDetail(row, tab = "info") {
    setDetailId(row.id);
    setDetailTab(tab);
  }

  return (
    <div className="staff-page">
      <PageHeader
        title="Команда"
        subtitle="Сотрудники и управление персоналом учебного центра"
        actions={
          <div className="staff-topbar">
            {canWrite ? (
              <Button type="button" onClick={openCreateModal}>
                + Добавить сотрудника
              </Button>
            ) : null}
            <Button type="button" className="secondary" onClick={exportExcel}>
              Экспорт Excel
            </Button>
          </div>
        }
      />

      <Banner>{error}</Banner>
      {loading ? <p className="staff-loading-note muted">Загрузка команды…</p> : null}

      <div className="staff-stats">
        {KPI_DEFS.map((item) => {
          const value =
            item.key === "payroll"
              ? money(kpi.payroll, "UZS")
              : item.key === "total"
                ? kpi.total
                : item.key === "teachers"
                  ? kpi.teachers
                  : item.key === "admins"
                    ? kpi.admins
                    : kpi.active;
          return (
            <div key={item.key} className={`staff-kpi tone-${item.tone}`}>
              <div className="staff-kpi-icon">{item.icon}</div>
              <div className="staff-kpi-value">
                <strong>{value}</strong>
                <span>{item.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="staff-filters card compact">
        <Field label="Поиск">
          <input
            placeholder="Имя, телефон или email"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </Field>
        <Field label="Роль">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">Все</option>
            {ROLE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Должность">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">Все</option>
            {ROLE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {rolePosition(item.value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Статус">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Все</option>
            <option value="active">Активен</option>
            <option value="inactive">Неактивен</option>
          </select>
        </Field>
        <Field label="Тип оплаты">
          <select value={filterPaymentType} onChange={(e) => setFilterPaymentType(e.target.value)}>
            <option value="">Все</option>
            {PAYMENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="staff-filter-reset">
          <button type="button" className="text-action" onClick={resetFilters}>
            Сбросить
          </button>
        </div>
      </div>

      <section className="card staff-table-card">
        <div className="staff-table-head">
          <h3>Сотрудники</h3>
          <span className="muted">{filteredStaff.length} записей</span>
        </div>

        {!filteredStaff.length ? (
          <EmptyState title="Сотрудников не найдено" />
        ) : (
          <>
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Должность</th>
                    <th>Роль</th>
                    <th>Телефон</th>
                    <th>Группы / нагрузка</th>
                    <th>Тип оплаты</th>
                    <th>Зарплата</th>
                    <th>Последняя выплата</th>
                    <th>Статус</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((row) => (
                    <tr key={row.id} className="is-clickable" onClick={() => openStaffDetail(row)}>
                      <td>
                        <div className="staff-person-cell">
                          <Avatar name={row.displayName} />
                          <div>
                            <strong>{row.displayName}</strong>
                            <span className="muted">{row.user?.email || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{row.position}</td>
                      <td>
                        <RoleBadge role={row.role} />
                      </td>
                      <td>{formatUzPhone(row.user?.phone) || "—"}</td>
                      <td>
                        {row.role === "teacher" ? (
                          <>
                            <strong>{row.groupCount} групп</strong>
                            <span className="muted">{row.lessonCount} занятий / мес</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{paymentTypeLabel(row.payment_type)}</td>
                      <td>
                        {row.payment_type ? (
                          <>
                            <strong>{money(row.accrued, "UZS")}</strong>
                            <span className="muted">
                              {row.payment_type === "per_lesson"
                                ? `${money(row.salary_rate, "UZS")} / урок`
                                : money(row.salary_rate, "UZS")}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.last_payout_at ? (
                          <>
                            <strong>{formatDate(row.last_payout_at)}</strong>
                            <span className="muted">
                              {money(row.last_payout_amount, "UZS")}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <StatusBadge active={row.is_active} />
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <RowActionsMenu
                          items={[
                            { label: "Подробнее", onClick: () => openStaffDetail(row) },
                            {
                              label: "Зарплата",
                              onClick: () => openStaffDetail(row, "salary"),
                            },
                            {
                              label: "Редактировать",
                              onClick: () => openEditModal(row),
                              hidden: !canWrite,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="staff-mobile-list">
              {filteredStaff.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="staff-mobile-card"
                  onClick={() => openStaffDetail(row)}
                >
                  <div className="staff-mobile-card-head">
                    <Avatar name={row.displayName} />
                    <div>
                      <strong>{row.displayName}</strong>
                      <span className="muted">{row.position}</span>
                    </div>
                    <RoleBadge role={row.role} />
                  </div>
                  <div className="staff-mobile-card-meta">
                    <span>{formatUzPhone(row.user?.phone) || "—"}</span>
                    <StatusBadge active={row.is_active} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {info ? <div className="staff-toast">{info}</div> : null}

      {detailRow ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка сотрудника">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setDetailId("")}
          />
          <aside className="sheet sheet-detail sheet-wide">
            <div className="sheet-head">
              <div className="staff-detail-head">
                <Avatar name={detailRow.displayName} size="lg" />
                <div>
                  <h2>{detailRow.displayName}</h2>
                  <p className="muted">
                    {formatUzPhone(detailRow.user?.phone) || "—"} · {detailRow.user?.email || "—"}
                  </p>
                  <RoleBadge role={detailRow.role} />
                </div>
              </div>
              <div className="sheet-head-actions">
                {canWrite ? (
                  <Button type="button" className="secondary" onClick={() => openEditModal(detailRow)}>
                    Редактировать
                  </Button>
                ) : null}
                <button
                  type="button"
                  className="sheet-close"
                  aria-label="Закрыть"
                  onClick={() => setDetailId("")}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="staff-detail-tabs">
              {[
                ["info", "Основная информация"],
                ["work", "Работа"],
                ["salary", "Зарплата"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`staff-detail-tab${detailTab === value ? " is-active" : ""}`}
                  onClick={() => setDetailTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="sheet-body">
              {detailTab === "info" ? (
                <dl className="staff-detail-list">
                  <div>
                    <dt>ФИО</dt>
                    <dd>{detailRow.displayName}</dd>
                  </div>
                  <div>
                    <dt>Телефон</dt>
                    <dd>{formatUzPhone(detailRow.user?.phone) || "—"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{detailRow.user?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt>Должность</dt>
                    <dd>{detailRow.position}</dd>
                  </div>
                  <div>
                    <dt>Роль</dt>
                    <dd>
                      <RoleBadge role={detailRow.role} />
                    </dd>
                  </div>
                  <div>
                    <dt>Статус</dt>
                    <dd>
                      <StatusBadge active={detailRow.is_active} />
                    </dd>
                  </div>
                  <div>
                    <dt>Дата найма</dt>
                    <dd>{detailRow.hired_on ? formatDate(detailRow.hired_on) : "—"}</dd>
                  </div>
                </dl>
              ) : null}

              {detailTab === "work" ? (
                <div className="staff-detail-work">
                  {detailRow.role === "teacher" ? (
                    <>
                      <p>
                        <strong>{detailRow.groupCount}</strong> групп ·{" "}
                        <strong>{detailRow.lessonCount}</strong> занятий в текущем месяце
                      </p>
                      {detailRow.groups.length ? (
                        <ul className="staff-group-list">
                          {detailRow.groups.map((group) => (
                            <li key={group.id}>
                              <strong>{group.name}</strong>
                              <span className="muted">
                                {courseMap[String(group.course)]?.name || "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">Группы не назначены</p>
                      )}
                    </>
                  ) : (
                    <p className="muted">Нагрузка преподавателя доступна только для роли «Преподаватель».</p>
                  )}
                </div>
              ) : null}

              {detailTab === "salary" && salaryForm ? (
                <div className="staff-detail-salary">
                  <div className="staff-salary-summary">
                    <div>
                      <span className="muted">Начислено за месяц</span>
                      <strong>{money(detailRow.accrued, "UZS")}</strong>
                    </div>
                    <div>
                      <span className="muted">Выплачено</span>
                      <strong>{money(detailRow.salary_paid_month, "UZS")}</strong>
                    </div>
                    <div>
                      <span className="muted">Остаток</span>
                      <strong>{money(detailRow.remaining, "UZS")}</strong>
                    </div>
                  </div>

                  {canWrite ? (
                    <form className="staff-salary-form" onSubmit={saveSalary}>
                      <Field label="Должность">
                        <input
                          placeholder={rolePosition(detailRow.role)}
                          value={salaryForm.position}
                          onChange={(e) =>
                            setSalaryForm({ ...salaryForm, position: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Дата найма">
                        <input
                          type="date"
                          value={salaryForm.hired_on || ""}
                          onChange={(e) =>
                            setSalaryForm({ ...salaryForm, hired_on: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Тип оплаты">
                        <select
                          value={salaryForm.payment_type}
                          onChange={(e) =>
                            setSalaryForm({ ...salaryForm, payment_type: e.target.value })
                          }
                        >
                          <option value="">Не указан</option>
                          {PAYMENT_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Оклад / ставка (UZS)">
                        <MoneyInput
                          value={salaryForm.salary_rate}
                          onChange={(value) =>
                            setSalaryForm({ ...salaryForm, salary_rate: value })
                          }
                        />
                      </Field>
                      <Field label="Выплачено за месяц (UZS)">
                        <MoneyInput
                          value={salaryForm.salary_paid_month}
                          onChange={(value) =>
                            setSalaryForm({ ...salaryForm, salary_paid_month: value })
                          }
                        />
                      </Field>
                      <Field label="Дата последней выплаты">
                        <input
                          type="datetime-local"
                          value={salaryForm.last_payout_at}
                          onChange={(e) =>
                            setSalaryForm({ ...salaryForm, last_payout_at: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Сумма последней выплаты (UZS)">
                        <MoneyInput
                          value={salaryForm.last_payout_amount}
                          onChange={(value) =>
                            setSalaryForm({ ...salaryForm, last_payout_amount: value })
                          }
                        />
                      </Field>
                      <div className="staff-salary-actions">
                        <Button type="submit" disabled={salarySaving}>
                          {salarySaving ? "Сохранение…" : "Сохранить зарплату"}
                        </Button>
                        <Button type="button" className="secondary" onClick={openPayroll}>
                          Открыть зарплату
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <dl className="staff-detail-list">
                      <div>
                        <dt>Тип оплаты</dt>
                        <dd>{paymentTypeLabel(detailRow.payment_type)}</dd>
                      </div>
                      <div>
                        <dt>Оклад / ставка</dt>
                        <dd>{money(detailRow.salary_rate, "UZS")}</dd>
                      </div>
                      <div>
                        <dt>Последняя выплата</dt>
                        <dd>
                          {detailRow.last_payout_at
                            ? `${formatDate(detailRow.last_payout_at)} · ${money(detailRow.last_payout_amount, "UZS")}`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {formOpen ? (
        <div className="overlay overlay-nested" role="dialog" aria-modal="true" aria-label="Сотрудник">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => !formSaving && setFormOpen(false)}
          />
          <div className="sheet billing-payment-sheet">
            <div className="sheet-head">
              <div>
                <h2>{formMode === "create" ? "Добавить сотрудника" : "Редактировать сотрудника"}</h2>
                <p className="muted">
                  {formMode === "create"
                    ? "Новый пользователь учебного центра"
                    : "Роль и статус сотрудника"}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                aria-label="Закрыть"
                onClick={() => !formSaving && setFormOpen(false)}
              >
                ×
              </button>
            </div>
            <form className="billing-payment-form-wrap" onSubmit={submitForm}>
              <div className="sheet-body billing-payment-form">
                {formMode === "create" ? (
                  <>
                    <Field label="Email">
                      <input
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </Field>
                    <Field label="Телефон">
                      <input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </Field>
                    <Field label="Имя">
                      <input
                        value={form.first_name}
                        onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      />
                    </Field>
                    <Field label="Фамилия">
                      <input
                        value={form.last_name}
                        onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      />
                    </Field>
                    <Field label="Пароль">
                      <input
                        type="text"
                        minLength={8}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="billing-payment-span-2 staff-form-readonly">
                      <strong>
                        {[form.first_name, form.last_name].filter(Boolean).join(" ") ||
                          form.email ||
                          "—"}
                      </strong>
                      <span className="muted">{form.email || form.phone || "—"}</span>
                    </div>
                  </>
                )}
                <Field label="Роль">
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    disabled={formMode === "edit" && form.role === "owner" && !canWrite}
                  >
                    {ROLE_OPTIONS.filter((item) => formMode === "create" && item.value === "owner" ? false : true).map(
                      (item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Должность">
                  <input
                    placeholder="Например: Преподаватель английского"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  />
                </Field>
                <Field label="Дата найма">
                  <input
                    type="date"
                    value={form.hired_on || ""}
                    onChange={(e) => setForm({ ...form, hired_on: e.target.value })}
                  />
                </Field>
                <Field label="Тип оплаты">
                  <select
                    value={form.payment_type}
                    onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                  >
                    <option value="">Не указан</option>
                    {PAYMENT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Оклад / ставка (UZS)">
                  <MoneyInput
                    value={form.salary_rate}
                    onChange={(value) => setForm({ ...form, salary_rate: value })}
                  />
                </Field>
                {formMode === "edit" ? (
                  <>
                    <Field label="Выплачено за месяц (UZS)">
                      <MoneyInput
                        value={form.salary_paid_month}
                        onChange={(value) => setForm({ ...form, salary_paid_month: value })}
                      />
                    </Field>
                    <Field label="Дата последней выплаты">
                      <input
                        type="datetime-local"
                        value={form.last_payout_at}
                        onChange={(e) => setForm({ ...form, last_payout_at: e.target.value })}
                      />
                    </Field>
                    <Field label="Сумма последней выплаты (UZS)">
                      <MoneyInput
                        value={form.last_payout_amount}
                        onChange={(value) => setForm({ ...form, last_payout_amount: value })}
                      />
                    </Field>
                  </>
                ) : null}
                {formMode === "edit" ? (
                  <Field label="Статус">
                    <select
                      value={form.is_active ? "active" : "inactive"}
                      onChange={(e) =>
                        setForm({ ...form, is_active: e.target.value === "active" })
                      }
                    >
                      <option value="active">Активен</option>
                      <option value="inactive">Неактивен</option>
                    </select>
                  </Field>
                ) : null}
              </div>
              <div className="sheet-foot billing-payment-foot">
                <Button type="submit" disabled={formSaving}>
                  {formSaving ? "Сохранение…" : formMode === "create" ? "Добавить" : "Сохранить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
