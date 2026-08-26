import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banner,
  Badge,
  Button,
  DataTable,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { ROLE_LABELS, STATUS_LABELS } from "@/constants";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { isAdminRole } from "@/utils/roleAccess";
import {
  formatDate,
  formatDay,
  formatTime,
  money,
  results,
  today,
} from "@/utils/format";
import PageFallback from "@/components/layout/PageFallback";

const ReceptionDashboard = lazy(() => import("./resepshen_yagona"));

const PAID_STATUSES = new Set(["paid", "void", "canceled", "cancelled"]);

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function isSameLocalDay(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function invoiceBalance(row) {
  if (row.balance != null && row.balance !== "") return Number(row.balance);
  return Number(row.amount || 0) - Number(row.paid_amount || 0);
}

function isOverdueInvoice(row) {
  if (!row?.due_at || PAID_STATUSES.has(row.status)) return false;
  if (row.status === "overdue") return true;
  return new Date(row.due_at) < new Date() && invoiceBalance(row) > 0;
}

export default function DashboardPage() {
  const role = currentMembership(getSession())?.role || "";
  if (isAdminRole(role)) {
    return (
      <Suspense fallback={<PageFallback label="Загрузка рабочего стола…" />}>
        <ReceptionDashboard />
      </Suspense>
    );
  }
  return <OwnerStyleDashboard />;
}

function OwnerStyleDashboard() {
  const session = getSession();
  const membership = currentMembership(session);
  const role = membership?.role || "";
  const isTeacher = role === "teacher";
  const isAccountant = role === "accountant";
  const showCrm = !isTeacher && !isAccountant;
  const showFinance = !isTeacher;

  const [summary, setSummary] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const tasks = [
        api.get("/dashboard/summary", { cache: true }),
        api.get("/lessons?page_size=100", { cache: true }),
        api.get("/groups?page_size=100", { cache: true }),
        api.get("/students?page_size=100", { cache: true }),
        api.get("/invoices?page_size=100", { cache: true }),
      ];
      if (showCrm) tasks.push(api.get("/leads?page_size=100", { cache: true }));
      if (showFinance) {
        tasks.push(api.get("/payments?page_size=100", { cache: true }).catch(() => ({ results: [] })));
      }
      const settled = await Promise.all(tasks);
      setSummary(settled[0]);
      setLessons(results(settled[1]));
      setGroups(results(settled[2]));
      setStudents(results(settled[3]));
      setInvoices(results(settled[4]));

      let next = 5;
      if (showCrm) {
        setLeads(results(settled[next]));
        next += 1;
      } else {
        setLeads([]);
      }
      if (showFinance) {
        setPayments(results(settled[next]));
      } else {
        setPayments([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [session.tenantId, showCrm, showFinance]);

  const studentName = useMemo(() => {
    const map = new Map(students.map((row) => [String(row.id), row.full_name]));
    return (id) => map.get(String(id)) || "—";
  }, [students]);

  const groupName = useMemo(() => {
    const map = new Map(groups.map((row) => [String(row.id), row.name]));
    return (id) => map.get(String(id)) || "—";
  }, [groups]);

  const lessonsToday = useMemo(
    () =>
      lessons
        .filter((row) => isSameLocalDay(row.starts_at))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [lessons],
  );

  const overdueInvoices = useMemo(
    () =>
      invoices
        .filter(isOverdueInvoice)
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
    [invoices],
  );

  const dueSoonInvoices = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 86400000;
    return invoices
      .filter((row) => {
        if (PAID_STATUSES.has(row.status) || isOverdueInvoice(row)) return false;
        const due = new Date(row.due_at).getTime();
        return due >= now && due <= week && invoiceBalance(row) > 0;
      })
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  }, [invoices]);

  const followUpsDue = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return leads
      .filter((row) => row.next_follow_up_at && new Date(row.next_follow_up_at) <= end)
      .sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at))
      .slice(0, 8);
  }, [leads]);

  const fullGroups = useMemo(
    () =>
      groups.filter((row) => {
        const active = Number(row.active_students || 0);
        const cap = Number(row.capacity || 0);
        return cap > 0 && active >= cap;
      }),
    [groups],
  );

  const paymentsThisMonth = useMemo(() => {
    const stamp = today().slice(0, 7);
    return payments.filter((row) => {
      if (row.status && row.status !== "succeeded") return false;
      const paid = String(row.paid_at || row.created_at || "").slice(0, 7);
      return paid === stamp;
    });
  }, [payments]);

  const monthPaymentTotal = useMemo(
    () => paymentsThisMonth.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [paymentsThisMonth],
  );

  const currency = summary?.currency || membership?.currency || "UZS";
  const leadsInfo = summary?.leads || {};

  const attention = useMemo(() => {
    const items = [];
    overdueInvoices.slice(0, 6).forEach((row) => {
      items.push({
        id: `inv-${row.id}`,
        title: studentName(row.student),
        detail: `Счёт ${row.number || ""} · ${money(invoiceBalance(row), row.currency || currency)}`,
        reason: "Просрочен",
        tone: "overdue",
        to: "billing",
      });
    });
    followUpsDue.slice(0, 5).forEach((row) => {
      items.push({
        id: `lead-${row.id}`,
        title: row.full_name,
        detail: row.phone || row.source || "Лид",
        reason: "Связаться",
        tone: "new",
        to: "crm",
      });
    });
    fullGroups.slice(0, 4).forEach((row) => {
      items.push({
        id: `group-${row.id}`,
        title: row.name,
        detail: `${row.active_students}/${row.capacity} мест`,
        reason: "Группа заполнена",
        tone: "active",
        to: "groups",
      });
    });
    return items;
  }, [overdueInvoices, followUpsDue, fullGroups, studentName, currency]);

  async function exportAnalytics() {
    setError("");
    setExporting(true);
    try {
      const { downloadExcelBook, excelStamp } = await import("@/utils/exportExcel");
      const center = membership?.tenant_name || membership?.tenant_slug || "center";
      downloadExcelBook(`yagona-${center}-obzor_${excelStamp()}.xlsx`, [
        {
          name: "Сводка",
          rows: [
            { metric: "Активные ученики", value: summary?.active_students ?? students.filter((s) => s.status === "active").length },
            { metric: "Уроки сегодня", value: summary?.lessons_today ?? lessonsToday.length },
            { metric: "Лиды", value: leadsInfo.total ?? leads.length },
            { metric: "Конверсия лидов %", value: leadsInfo.conversion_rate ?? "" },
            { metric: "Просроченных счетов", value: summary?.overdue_invoices ?? overdueInvoices.length },
            { metric: "Сумма просрочки", value: Number(summary?.overdue_total || 0) },
            {
              metric: "Сборы за месяц (сводка)",
              value: Number(summary?.collected_this_month || 0),
            },
            { metric: "Оплаты за месяц (реестр)", value: monthPaymentTotal },
            { metric: "Счетов к оплате (7 дней)", value: dueSoonInvoices.length },
            { metric: "Валюта", value: currency },
          ],
          columns: [
            { key: "metric", title: "Показатель" },
            { key: "value", title: "Значение" },
          ],
        },
        {
          name: "Просроченные счета",
          rows: overdueInvoices,
          columns: [
            { key: "number", title: "Номер", value: (row) => row.number || "" },
            {
              key: "student",
              title: "Ученик",
              value: (row) => studentName(row.student),
            },
            {
              key: "amount",
              title: "Сумма",
              value: (row) => Number(row.amount || 0),
            },
            {
              key: "balance",
              title: "Долг",
              value: (row) => invoiceBalance(row),
            },
            {
              key: "due_at",
              title: "Срок",
              value: (row) => (row.due_at ? formatDate(row.due_at) : ""),
            },
            {
              key: "status",
              title: "Статус",
              value: (row) => STATUS_LABELS[row.status] || row.status || "",
            },
            {
              key: "description",
              title: "Описание",
              value: (row) => row.description || "",
            },
          ],
        },
        {
          name: "Оплаты месяца",
          rows: paymentsThisMonth.length ? paymentsThisMonth : payments,
          columns: [
            {
              key: "paid_at",
              title: "Дата",
              value: (row) =>
                row.paid_at || row.created_at
                  ? formatDate(row.paid_at || row.created_at)
                  : "",
            },
            {
              key: "amount",
              title: "Сумма",
              value: (row) => Number(row.amount || 0),
            },
            {
              key: "method",
              title: "Способ",
              value: (row) => row.method || "",
            },
            {
              key: "status",
              title: "Статус",
              value: (row) => STATUS_LABELS[row.status] || row.status || "",
            },
            {
              key: "invoice",
              title: "Счёт",
              value: (row) => row.invoice || "",
            },
          ],
        },
        {
          name: "Уроки сегодня",
          rows: lessonsToday,
          columns: [
            {
              key: "starts_at",
              title: "Время",
              value: (row) => formatTime(row.starts_at),
            },
            {
              key: "group",
              title: "Группа",
              value: (row) => groupName(row.group),
            },
            { key: "topic", title: "Тема", value: (row) => row.topic || "" },
            {
              key: "status",
              title: "Статус",
              value: (row) => STATUS_LABELS[row.status] || row.status || "",
            },
          ],
        },
      ]);
    } catch (err) {
      setError(err.message || "Не удалось скачать Excel");
    } finally {
      setExporting(false);
    }
  }

  const userName =
    session.user?.first_name ||
    session.user?.full_name ||
    session.user?.email?.split("@")[0] ||
    "";

  return (
    <div>
      <PageHeader
        eyebrow={membership?.tenant_name || "Учебный центр"}
        title={`${greetingForNow()}${userName ? `, ${userName}` : ""}`}
        subtitle={`${formatDay(new Date().toISOString())} · ${
          ROLE_LABELS[role] || "сотрудник"
        } · что важно сегодня`}
        actions={
          <div className="actions">
            {showFinance ? (
              <Button
                type="button"
                className="secondary"
                busy={exporting}
                disabled={loading}
                onClick={exportAnalytics}
              >
                Скачать Excel
              </Button>
            ) : null}
            <Button type="button" className="secondary" busy={loading} onClick={load}>
              Обновить
            </Button>
            <Link className="btn" to={isTeacher ? "schedule" : "billing"}>
              {isTeacher ? "Расписание" : "Биллинг"}
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>

      {summary || !loading ? (
        <>
          <section className="section-block">
            <div className="section-head">
              <h3>Сейчас в центре</h3>
              <span className="muted">Ключевые показатели</span>
            </div>
            <div className="grid cols-4">
              <StatCard
                label="Ученики"
                value={summary?.active_students ?? "—"}
                hint="активные"
              />
              <StatCard
                label="Уроки сегодня"
                value={summary?.lessons_today ?? lessonsToday.length}
                hint={lessonsToday.length ? `ближайший ${formatTime(lessonsToday[0]?.starts_at)}` : "нет слотов"}
              />
              {showCrm ? (
                <StatCard
                  label="Лиды"
                  value={leadsInfo.total ?? 0}
                  hint={`конверсия ${leadsInfo.conversion_rate ?? 0}%`}
                />
              ) : (
                <StatCard
                  label="Группы"
                  value={groups.filter((g) => g.is_active !== false).length}
                  hint={`${fullGroups.length} заполнены`}
                />
              )}
              {showFinance ? (
                <StatCard
                  label="Просрочено"
                  value={summary?.overdue_invoices ?? overdueInvoices.length}
                  hint={money(summary?.overdue_total, currency)}
                />
              ) : (
                <StatCard
                  label="Посещаемость"
                  value={lessonsToday.length}
                  hint="отметить после урока"
                />
              )}
            </div>
          </section>

          {showFinance ? (
            <section className="section-block">
              <div className="section-head">
                <h3>Оплаты</h3>
                <Link className="text-action" to="billing">
                  Открыть биллинг
                </Link>
              </div>
              <div className="grid cols-4">
                <StatCard
                  label="Сборы за месяц"
                  value={money(summary?.collected_this_month, currency)}
                  hint="успешные платежи"
                />
                <StatCard
                  label="Оплат в реестре"
                  value={paymentsThisMonth.length || "—"}
                  hint={
                    paymentsThisMonth.length
                      ? money(monthPaymentTotal, currency)
                      : "из /payments"
                  }
                />
                <StatCard
                  label="К оплате (7 дн.)"
                  value={dueSoonInvoices.length}
                  hint="скоро срок"
                />
                <StatCard
                  label="Долг"
                  value={money(summary?.overdue_total, currency)}
                  hint={`${overdueInvoices.length} счетов`}
                />
              </div>
            </section>
          ) : null}

          <section className="card ornament" style={{ marginBottom: 18 }}>
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h3>Быстрые действия</h3>
            </div>
            <div className="quick-actions">
              {showCrm ? (
                <Link className="quick-action" to="crm">
                  <strong>Новый лид</strong>
                  <span>CRM и воронка продаж</span>
                </Link>
              ) : null}
              {!isAccountant ? (
                <Link className="quick-action" to="students">
                  <strong>Ученики</strong>
                  <span>Карточки и статусы</span>
                </Link>
              ) : null}
              {!isAccountant ? (
                <Link className="quick-action" to="schedule">
                  <strong>Расписание</strong>
                  <span>Уроки на сегодня</span>
                </Link>
              ) : null}
              {!isAccountant ? (
                <Link className="quick-action" to="attendance">
                  <strong>Посещаемость</strong>
                  <span>Отметить присутствие</span>
                </Link>
              ) : null}
              {showFinance ? (
                <Link className="quick-action" to="billing">
                  <strong>Выставить счёт</strong>
                  <span>Тарифы и оплаты</span>
                </Link>
              ) : null}
              {!isTeacher && !isAccountant ? (
                <Link className="quick-action" to="groups">
                  <strong>Группы</strong>
                  <span>Заполненность и состав</span>
                </Link>
              ) : null}
            </div>
          </section>

          <div className="grid cols-2" style={{ gap: 16, alignItems: "start", marginBottom: 18 }}>
            <section className="card">
              <div className="section-head">
                <h3>Требуют внимания</h3>
                <span className="muted">
                  {attention.length ? `${attention.length}` : "Всё спокойно"}
                </span>
              </div>
              {attention.length ? (
                <ul className="attention-list">
                  {attention.map((item) => (
                    <li key={item.id}>
                      <div className="attention-main">
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </div>
                        <Badge value={item.tone} label={item.reason} />
                      </div>
                      <div className="attention-actions">
                        <Link className="text-action" to={item.to}>
                          Открыть
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">Нет просрочек, срочных лидов и переполненных групп.</p>
              )}
            </section>

            <section className="card">
              <div className="section-head">
                <h3>Уроки сегодня</h3>
                <Link className="text-action" to="schedule">
                  Расписание
                </Link>
              </div>
              <DataTable
                rows={lessonsToday.slice(0, 8)}
                empty="На сегодня уроков нет"
                columns={[
                  {
                    key: "starts_at",
                    title: "Время",
                    render: (row) => (
                      <strong>
                        {formatTime(row.starts_at)}–{formatTime(row.ends_at)}
                      </strong>
                    ),
                  },
                  {
                    key: "group",
                    title: "Группа",
                    render: (row) => groupName(row.group),
                  },
                  {
                    key: "topic",
                    title: "Тема",
                    render: (row) => row.topic || "—",
                  },
                  {
                    key: "status",
                    title: "Статус",
                    render: (row) => <Badge value={row.status} />,
                  },
                ]}
              />
              {lessonsToday.length ? (
                <div style={{ marginTop: 12 }}>
                  <Link className="btn secondary" to="attendance">
                    Отметить посещаемость
                  </Link>
                </div>
              ) : null}
            </section>
          </div>

          <div className="grid cols-2" style={{ gap: 16, alignItems: "start" }}>
            {showFinance ? (
              <section className="card highlight">
                <div className="section-head">
                  <h3>Финансы месяца</h3>
                  <Button
                    type="button"
                    className="secondary compact"
                    busy={exporting}
                    onClick={exportAnalytics}
                  >
                    Excel
                  </Button>
                </div>
                <div className="stat-label">Собрано</div>
                <div className="stat">{money(summary?.collected_this_month, currency)}</div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Просрочка: {money(summary?.overdue_total, currency)} · к оплате в 7 дней:{" "}
                  {dueSoonInvoices.length}
                </p>
                {overdueInvoices.length ? (
                  <div style={{ marginTop: 14 }}>
                    <DataTable
                      rows={overdueInvoices.slice(0, 5)}
                      empty=""
                      columns={[
                        {
                          key: "student",
                          title: "Ученик",
                          render: (row) => studentName(row.student),
                        },
                        {
                          key: "balance",
                          title: "Долг",
                          align: "right",
                          render: (row) => money(invoiceBalance(row), row.currency || currency),
                        },
                        {
                          key: "due_at",
                          title: "Срок",
                          render: (row) => formatDate(row.due_at),
                        },
                      ]}
                    />
                  </div>
                ) : null}
                <Link
                  className="btn"
                  to="billing"
                  style={{ display: "inline-flex", marginTop: 14 }}
                >
                  К биллингу
                </Link>
              </section>
            ) : (
              <section className="card highlight">
                <div className="stat-label">Сегодня</div>
                <div className="stat">{lessonsToday.length} уроков</div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Отметьте посещаемость после занятия.
                </p>
                <Link
                  className="btn"
                  to="attendance"
                  style={{ display: "inline-flex", marginTop: 14 }}
                >
                  Посещаемость
                </Link>
              </section>
            )}

            {showCrm ? (
              <section className="card ornament">
                <div className="section-head" style={{ marginBottom: 4 }}>
                  <h3>Воронка CRM</h3>
                  <Link className="text-action" to="crm">
                    Открыть
                  </Link>
                </div>
                {(leadsInfo.by_stage || []).length ? (
                  <div className="grid" style={{ gap: 8, marginTop: 8 }}>
                    {(leadsInfo.by_stage || []).map((stage) => (
                      <div
                        className="row"
                        key={stage.id}
                        style={{ justifyContent: "space-between" }}
                      >
                        <span>{stage.name}</span>
                        <span className="status">{stage.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Стадий пока нет</div>
                )}
                <p className="muted" style={{ marginTop: 10 }}>
                  Конвертировано: {leadsInfo.converted ?? 0} · на связи сегодня:{" "}
                  {followUpsDue.length}
                </p>
                <Link
                  className="btn secondary"
                  to="crm"
                  style={{ display: "inline-flex", marginTop: 14 }}
                >
                  К CRM
                </Link>
              </section>
            ) : (
              <section className="card ornament">
                <div className="section-head">
                  <h3>Группы</h3>
                  <Link className="text-action" to="groups">
                    Все группы
                  </Link>
                </div>
                <DataTable
                  rows={groups.slice(0, 6)}
                  empty="Групп пока нет"
                  columns={[
                    { key: "name", title: "Группа" },
                    {
                      key: "active_students",
                      title: "Ученики",
                      render: (row) =>
                        `${row.active_students ?? 0}${row.capacity ? ` / ${row.capacity}` : ""}`,
                    },
                  ]}
                />
              </section>
            )}
          </div>
        </>
      ) : (
        <p className="muted">Загружаем обзор центра…</p>
      )}
    </div>
  );
}
