import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Banner,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  TextAction,
} from "@/components/ui";
import { STUDENT_STATUS_LABELS } from "@/constants";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import {
  formatDate,
  formatUzPhone,
  looksLikeEmail,
  money,
  results,
  today,
} from "@/utils/format";

const emptyForm = {
  full_name: "",
  birth_date: "",
  phone: "",
  email: "",
  parent_name: "",
  parent_phone: "",
  course: "",
  group: "",
  start_date: today(),
  notes: "",
};

const PAYMENT_LABELS = {
  overdue: "просрочка",
  debt: "долг",
  paid: "оплачено",
  none: "нет счетов",
};

const OPEN_INVOICE = new Set(["issued", "partially_paid", "overdue"]);

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

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function byId(list) {
  return Object.fromEntries((list || []).map((item) => [item.id, item]));
}

function invoiceBalance(invoice) {
  if (invoice.balance != null && invoice.balance !== "") return num(invoice.balance);
  return num(invoice.amount) - num(invoice.paid_amount);
}

function onPhoneChange(value, setter) {
  if (!value) {
    setter("");
    return;
  }
  if (looksLikeEmail(value)) {
    setter(value);
    return;
  }
  setter(formatUzPhone(value));
}

function enrichStudents({ students, groups, courses, enrollments, guardians, links, invoices, payments }) {
  const groupMap = byId(groups);
  const courseMap = byId(courses);
  const guardianMap = byId(guardians);
  const invoiceMap = byId(invoices);
  const linksByStudent = {};
  for (const link of links) {
    (linksByStudent[link.student] ||= []).push(link);
  }
  const enrollByStudent = {};
  for (const row of enrollments) {
    (enrollByStudent[row.student] ||= []).push(row);
  }
  const invoicesByStudent = {};
  for (const invoice of invoices) {
    (invoicesByStudent[invoice.student] ||= []).push(invoice);
  }
  const paymentsByStudent = {};
  for (const payment of payments) {
    const studentId = invoiceMap[payment.invoice]?.student;
    if (!studentId) continue;
    (paymentsByStudent[studentId] ||= []).push(payment);
  }

  return students.map((student) => {
    const studentLinks = linksByStudent[student.id] || [];
    const primary =
      studentLinks.find((item) => item.is_primary) || studentLinks[0] || null;
    const guardian = primary ? guardianMap[primary.guardian] : null;
    const studentEnrollments = (enrollByStudent[student.id] || []).filter(
      (item) => item.status === "active",
    );
    const groupItems = studentEnrollments.map((item) => groupMap[item.group]).filter(Boolean);
    const courseItems = groupItems.map((group) => courseMap[group.course]).filter(Boolean);
    const studentInvoices = invoicesByStudent[student.id] || [];
    const debt = studentInvoices
      .filter((invoice) => OPEN_INVOICE.has(invoice.status))
      .reduce((sum, invoice) => sum + invoiceBalance(invoice), 0);
    const hasOverdue = studentInvoices.some((invoice) => invoice.status === "overdue");
    const lastPayment = (paymentsByStudent[student.id] || [])
      .filter((item) => item.status === "succeeded")
      .sort((a, b) => String(b.paid_at || "").localeCompare(String(a.paid_at || "")))[0];
    let payment_status = "none";
    if (hasOverdue) payment_status = "overdue";
    else if (debt > 0) payment_status = "debt";
    else if (studentInvoices.length) payment_status = "paid";

    return {
      ...student,
      guardian,
      guardian_link: primary,
      enrollments: studentEnrollments,
      groups: groupItems,
      courses: courseItems,
      debt,
      last_payment: lastPayment || null,
      payment_status,
      invoices: studentInvoices,
    };
  });
}

export default function StudentsPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [studentData, groupData, courseData, enrollmentData, guardianData, linkData] =
        await Promise.all([
          asList("/students?page_size=100"),
          asList("/groups?page_size=100"),
          asList("/courses?page_size=100"),
          asList("/enrollments?page_size=100"),
          optionalList("/guardians?page_size=100"),
          optionalList("/student-guardians?page_size=100"),
        ]);
      const [invoiceData, paymentData] = await Promise.all([
        optionalList("/invoices?page_size=100"),
        optionalList("/payments?page_size=100"),
      ]);
      setGroups(groupData);
      setCourses(courseData);
      setStudents(
        enrichStudents({
          students: studentData,
          groups: groupData,
          courses: courseData,
          enrollments: enrollmentData,
          guardians: guardianData,
          links: linkData,
          invoices: invoiceData,
          payments: paymentData,
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

  const filteredGroups = useMemo(
    () =>
      form.course ? groups.filter((item) => String(item.course) === String(form.course)) : groups,
    [form.course, groups],
  );

  const hasBilling = useMemo(
    () => students.some((item) => item.invoices?.length || item.last_payment || item.debt > 0),
    [students],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = digits(query);
    return students.filter((student) => {
      if (statusFilter && student.status !== statusFilter) return false;
      if (paymentFilter && student.payment_status !== paymentFilter) return false;
      if (groupFilter && !student.groups.some((group) => String(group.id) === String(groupFilter))) {
        return false;
      }
      if (!q && !qDigits) return true;
      const hay = `${student.full_name || ""} ${student.email || ""}`.toLowerCase();
      const phones = `${student.phone || ""} ${student.guardian?.phone || ""}`;
      return hay.includes(q) || (qDigits && digits(phones).includes(qDigits));
    });
  }, [students, query, groupFilter, statusFilter, paymentFilter]);

  const selected = useMemo(
    () => students.find((item) => String(item.id) === String(selectedId)) || null,
    [students, selectedId],
  );

  function openCreate() {
    setError("");
    setInfo("");
    setForm({ ...emptyForm, start_date: today() });
    setCreateOpen(true);
  }

  function openStudent(student) {
    setError("");
    setInfo("");
    setSelectedId(student.id);
    setEditForm({
      full_name: student.full_name || "",
      birth_date: student.birth_date || "",
      phone: student.phone || "",
      email: student.email || "",
      notes: student.notes || "",
      status: student.status || "active",
      parent_name: student.guardian?.full_name || "",
      parent_phone: student.guardian?.phone || "",
      guardian_id: student.guardian?.id || "",
      guardian_link_id: student.guardian_link?.id || "",
    });
    setPassword("");
    setPassword2("");
  }

  function closeStudent() {
    setSelectedId("");
    setEditForm(null);
    setPassword("");
    setPassword2("");
  }

  async function ensureGuardian(parentName, parentPhone) {
    const phoneDigits = digits(parentPhone);
    try {
      return await api.post("/guardians", { full_name: parentName, phone: parentPhone });
    } catch (err) {
      const found = results(
        await api.get(`/guardians?search=${encodeURIComponent(parentPhone)}&page_size=100`),
      );
      const match = found.find((item) => digits(item.phone) === phoneDigits);
      if (match) return match;
      throw err;
    }
  }

  async function syncStudentGuardian(
    studentId,
    { parentName, parentPhone, guardianId, guardianLinkId },
  ) {
    if (!parentName && !parentPhone) return;
    if ((parentName && !parentPhone) || (!parentName && parentPhone)) {
      throw new Error("Укажите имя и телефон родителя вместе.");
    }

    if (guardianId) {
      try {
        await api.patch(`/guardians/${guardianId}`, {
          full_name: parentName,
          phone: parentPhone,
        });
        return;
      } catch {
        const guardian = await ensureGuardian(parentName, parentPhone);
        if (guardianLinkId) {
          await api.patch(`/student-guardians/${guardianLinkId}`, {
            guardian: guardian.id,
            relationship: "parent",
            is_primary: true,
          });
        } else {
          await api.post("/student-guardians", {
            student: studentId,
            guardian: guardian.id,
            relationship: "parent",
            is_primary: true,
          });
        }
        return;
      }
    }

    const guardian = await ensureGuardian(parentName, parentPhone);
    await api.post("/student-guardians", {
      student: studentId,
      guardian: guardian.id,
      relationship: "parent",
      is_primary: true,
    });
  }

  async function createStudent(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    const parentName = form.parent_name.trim();
    const parentPhone = form.parent_phone.trim();
    if ((parentName && !parentPhone) || (!parentName && parentPhone)) {
      setError("Укажите имя и телефон родителя вместе.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.post("/students", {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        birth_date: form.birth_date || null,
        notes: form.notes.trim(),
        status: "active",
      });
      if (parentName && parentPhone) {
        await syncStudentGuardian(created.id, {
          parentName,
          parentPhone,
          guardianId: "",
          guardianLinkId: "",
        });
      }
      if (form.group) {
        await api.post("/enrollments", {
          student: created.id,
          group: form.group,
          joined_at: form.start_date || today(),
        });
      }
      setCreateOpen(false);
      setForm(emptyForm);
      setInfo(
        created.temporary_password
          ? `Ученик сохранён. Временный пароль: ${created.temporary_password}`
          : "Ученик сохранён.",
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (!selected || !editForm) return;
    setError("");
    setInfo("");
    if (password || password2) {
      if (password !== password2) {
        setError("Пароли не совпадают.");
        return;
      }
      if (password.length < 8) {
        setError("Пароль должен быть не короче 8 символов.");
        return;
      }
    }
    const parentName = editForm.parent_name.trim();
    const parentPhone = editForm.parent_phone.trim();
    if ((parentName && !parentPhone) || (!parentName && parentPhone)) {
      setError("Укажите имя и телефон родителя вместе.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        birth_date: editForm.birth_date || null,
        notes: editForm.notes.trim(),
        status: editForm.status,
      };
      if (password) payload.password = password;
      await api.patch(`/students/${selected.id}`, payload);
      if (parentName && parentPhone) {
        await syncStudentGuardian(selected.id, {
          parentName,
          parentPhone,
          guardianId: editForm.guardian_id,
          guardianLinkId: editForm.guardian_link_id,
        });
      }
      setPassword("");
      setPassword2("");
      setInfo(password ? "Данные и пароль сохранены." : "Данные ученика сохранены.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetTemporary() {
    if (!selected) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const updated = await api.patch(`/students/${selected.id}`, { reset_temporary: true });
      setPassword("");
      setPassword2("");
      setInfo(
        updated.temporary_password
          ? `Временный пароль: ${updated.temporary_password}`
          : "Пароль сброшен.",
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const hasFilters = query || groupFilter || statusFilter || paymentFilter;

  return (
    <div className="students-page">
      <PageHeader
        title="Ученики"
        subtitle="Карточка, зачисление и кабинет. Временный пароль: телефон + название центра."
        actions={
          canWrite ? (
            <Button type="button" onClick={openCreate}>
              + Добавить ученика
            </Button>
          ) : null
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <div className="crm-toolbar">
        <div className="crm-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: имя, телефон ученика или родителя…"
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
            всего <strong>{students.length}</strong>
          </span>
        </div>
      </div>

      {filtersOpen ? (
        <div className="crm-filters">
          <Field label="Группа">
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Статус">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {hasBilling ? (
            <Field label="Оплата">
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="">Все оплаты</option>
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Button type="button" className="secondary compact" busy={loading} onClick={load}>
            Обновить
          </Button>
          {hasFilters ? (
            <Button
              type="button"
              className="secondary compact"
              onClick={() => {
                setQuery("");
                setGroupFilter("");
                setStatusFilter("");
                setPaymentFilter("");
              }}
            >
              Сбросить
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="card">
          <EmptyState title="Загрузка…" body="Получаем список учеников." />
        </div>
      ) : error && !students.length ? (
        <div className="card">
          <EmptyState
            title="Не удалось загрузить учеников"
            body={error}
            action={
              <Button type="button" className="secondary" onClick={load}>
                Повторить
              </Button>
            }
          />
        </div>
      ) : !students.length ? (
        <div className="card">
          <EmptyState
            title="Пока нет учеников"
            body="Добавьте первого ученика, чтобы вести группы, оплату и кабинет."
            action={
              canWrite ? (
                <Button type="button" onClick={openCreate}>
                  + Добавить ученика
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="card">
          <DataTable
            rows={filtered}
            empty={hasFilters ? "Ничего не найдено по фильтрам" : "Учеников пока нет"}
            onRowClick={openStudent}
            columns={[
              {
                key: "full_name",
                title: "Ученик",
                render: (row) => (
                  <div className="person">
                    <Avatar name={row.full_name} />
                    <div className="person-copy">
                      <button
                        type="button"
                        className="table-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          openStudent(row);
                        }}
                      >
                        {row.full_name}
                      </button>
                      {row.email ? <div>{row.email}</div> : null}
                    </div>
                  </div>
                ),
              },
              { key: "phone", title: "Телефон" },
              {
                key: "guardian",
                title: "Родитель",
                render: (row) =>
                  row.guardian ? (
                    <>
                      <div>{row.guardian.full_name}</div>
                      <div className="muted">{row.guardian.phone}</div>
                    </>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "group",
                title: "Группа / курс",
                render: (row) =>
                  row.groups.length ? (
                    <>
                      <div>{row.groups.map((item) => item.name).join(", ")}</div>
                      <div className="muted">
                        {row.courses.map((item) => item.name).join(", ") || "—"}
                      </div>
                    </>
                  ) : (
                    "—"
                  ),
              },
              ...(hasBilling
                ? [
                    {
                      key: "debt",
                      title: "Долг",
                      render: (row) =>
                        row.debt > 0 ? (
                          <span className="students-debt">{money(row.debt)}</span>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      key: "last_payment",
                      title: "Последняя оплата",
                      render: (row) =>
                        row.last_payment ? (
                          <>
                            <div>{formatDate(row.last_payment.paid_at)}</div>
                            <div className="muted">{money(row.last_payment.amount)}</div>
                          </>
                        ) : (
                          "—"
                        ),
                    },
                  ]
                : []),
              {
                key: "created_at",
                title: "Поступление",
                render: (row) => formatDate(row.created_at),
              },
              {
                key: "status",
                title: "Статус",
                render: (row) => (
                  <div className="detail-badges">
                    <Badge
                      value={row.status}
                      label={STUDENT_STATUS_LABELS[row.status] || row.status}
                    />
                    {hasBilling ? (
                      <Badge
                        value={row.payment_status === "debt" ? "partially_paid" : row.payment_status}
                        label={PAYMENT_LABELS[row.payment_status] || row.payment_status}
                      />
                    ) : null}
                  </div>
                ),
              },
              {
                key: "actions",
                title: "",
                stopRowClick: true,
                render: (row) => (
                  <TextAction
                    onClick={() => openStudent(row)}
                  >
                    Открыть
                  </TextAction>
                ),
              },
            ]}
          />
        </div>
      )}

      {createOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Новый ученик">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setCreateOpen(false)}
          />
          <form className="sheet sheet-wide" onSubmit={createStudent}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Ученики</div>
                <h2>+ Добавить ученика</h2>
                <p className="muted">Пароль кабинета выдаётся автоматически: телефон + название центра.</p>
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
              <div className="grid cols-2" style={{ gap: 12 }}>
                <Field label="ФИО">
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Дата рождения">
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                  />
                </Field>
                <Field label="Телефон ученика">
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      onPhoneChange(e.target.value, (phone) => setForm({ ...form, phone }))
                    }
                    placeholder="+998 90 123 45 67"
                    required
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Родитель / опекун">
                  <input
                    value={form.parent_name}
                    onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                  />
                </Field>
                <Field label="Телефон родителя">
                  <input
                    value={form.parent_phone}
                    onChange={(e) =>
                      onPhoneChange(e.target.value, (parent_phone) =>
                        setForm({ ...form, parent_phone }),
                      )
                    }
                    placeholder="+998 90 123 45 67"
                  />
                </Field>
                <Field label="Курс">
                  <select
                    value={form.course}
                    onChange={(e) => setForm({ ...form, course: e.target.value, group: "" })}
                  >
                    <option value="">Не выбран</option>
                    {courses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Группа">
                  <select
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value })}
                  >
                    <option value="">Без группы</option>
                    {filteredGroups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Дата начала">
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </Field>
                <Field label="Заметки">
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Сохранить ученика
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {selected && editForm ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка ученика">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={closeStudent}
          />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Ученик</div>
                <h2>{selected.full_name}</h2>
                <p className="muted">
                  {selected.phone || "без телефона"}
                  {selected.email ? ` · ${selected.email}` : ""}
                </p>
              </div>
              <button type="button" className="sheet-close" onClick={closeStudent} aria-label="Закрыть">
                ×
              </button>
            </div>

            <div className="sheet-body">
              <div className="detail-badges">
                <Badge
                  value={selected.status}
                  label={STUDENT_STATUS_LABELS[selected.status] || selected.status}
                />
                {hasBilling ? (
                  <Badge
                    value={
                      selected.payment_status === "debt" ? "partially_paid" : selected.payment_status
                    }
                    label={PAYMENT_LABELS[selected.payment_status] || selected.payment_status}
                  />
                ) : null}
              </div>

              <section className="detail-section">
                <h3>Контакты</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Родитель</dt>
                    <dd>
                      {selected.guardian
                        ? `${selected.guardian.full_name} · ${selected.guardian.phone}`
                        : "—"}
                    </dd>
                  </div>
                  <div className="detail-row">
                    <dt>Группа / курс</dt>
                    <dd>
                      {selected.groups.length
                        ? `${selected.groups.map((item) => item.name).join(", ")}${
                            selected.courses.length
                              ? ` · ${selected.courses.map((item) => item.name).join(", ")}`
                              : ""
                          }`
                        : "—"}
                    </dd>
                  </div>
                  <div className="detail-row">
                    <dt>Поступление</dt>
                    <dd>{formatDate(selected.created_at)}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Дата рождения</dt>
                    <dd>{formatDate(selected.birth_date)}</dd>
                  </div>
                  {hasBilling ? (
                    <>
                      <div className="detail-row">
                        <dt>Долг</dt>
                        <dd>{selected.debt > 0 ? money(selected.debt) : "Нет"}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Последняя оплата</dt>
                        <dd>
                          {selected.last_payment
                            ? `${formatDate(selected.last_payment.paid_at)} · ${money(selected.last_payment.amount)}`
                            : "—"}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </section>

              {canWrite ? (
                <section className="detail-section">
                  <h3>Редактирование</h3>
                  <form className="grid" style={{ gap: 12 }} onSubmit={saveStudent}>
                    <Field label="ФИО">
                      <input
                        value={editForm.full_name}
                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        required
                      />
                    </Field>
                    <div className="grid cols-2" style={{ gap: 12 }}>
                      <Field label="Телефон">
                        <input
                          value={editForm.phone}
                          onChange={(e) =>
                            onPhoneChange(e.target.value, (phone) => setEditForm({ ...editForm, phone }))
                          }
                          required
                        />
                      </Field>
                      <Field label="Email">
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="grid cols-2" style={{ gap: 12 }}>
                      <Field label="Родитель / опекун">
                        <input
                          value={editForm.parent_name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, parent_name: e.target.value })
                          }
                          placeholder={selected.guardian ? undefined : "Не указан"}
                        />
                      </Field>
                      <Field label="Телефон родителя">
                        <input
                          value={editForm.parent_phone}
                          onChange={(e) =>
                            onPhoneChange(e.target.value, (parent_phone) =>
                              setEditForm({ ...editForm, parent_phone }),
                            )
                          }
                          placeholder="+998 90 123 45 67"
                        />
                      </Field>
                    </div>
                    {!selected.guardian && !editForm.parent_name && !editForm.parent_phone ? (
                      <p className="muted">Родитель не указан — заполните имя и телефон, чтобы добавить.</p>
                    ) : null}
                    <Field label="Дата рождения">
                      <input
                        type="date"
                        value={editForm.birth_date}
                        onChange={(e) => setEditForm({ ...editForm, birth_date: e.target.value })}
                      />
                    </Field>
                    <Field label="Статус">
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      >
                        {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Заметки">
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      />
                    </Field>
                    <Field label="Новый пароль">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </Field>
                    <Field label="Повтор пароля">
                      <input
                        type="password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        autoComplete="new-password"
                      />
                    </Field>
                    <p className="muted">
                      Пустой пароль не меняет вход. Сброс ставит временный: телефон + название центра.
                    </p>
                    <div className="row">
                      <Button type="submit" busy={busy}>
                        Сохранить карточку
                      </Button>
                      <Button type="button" className="secondary" onClick={resetTemporary} busy={busy}>
                        Сбросить временный пароль
                      </Button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
