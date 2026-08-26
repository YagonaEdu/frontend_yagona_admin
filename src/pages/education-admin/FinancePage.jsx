import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banner,
  Button,
  Field,
  MoneyInput,
  PageHeader,
  RowActionsMenu,
} from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { hasCapability } from "@/utils/roleAccess";
import { formatDate, money, priceToApi, results, today } from "@/utils/format";

const PAYMENT_TYPES = [
  { value: "fixed", label: "Фиксированная" },
  { value: "per_lesson", label: "За урок" },
  { value: "hourly", label: "Почасовая" },
];

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const KPI_DEFS = [
  { key: "wallet", label: "В кошельке (расчёт)", tone: "blue", icon: "SUM" },
  { key: "collected", label: "Поступило за месяц", tone: "green", icon: "↓" },
  { key: "expected", label: "Ожидается от учеников", tone: "orange", icon: "◷" },
  { key: "debt", label: "Долг учеников", tone: "red", icon: "!" },
  { key: "payrollDue", label: "К выплате зарплат", tone: "purple", icon: "T" },
  { key: "expenses", label: "Расходы за месяц", tone: "red", icon: "↑" },
];

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function paymentTypeLabel(value) {
  return PAYMENT_TYPES.find((item) => item.value === value)?.label || "—";
}

function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function currentMonthValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function periodFirstDay(ym) {
  if (!ym) return today().slice(0, 8) + "01";
  return ym.length === 7 ? `${ym}-01` : ym.slice(0, 10);
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_NAMES[idx] || m} ${y}`;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function toDatetimeLocal(value) {
  if (!value) return `${today()}T12:00`;
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function monthRange(dateStr = today()) {
  const d = new Date(`${dateStr}T12:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

function inDateRange(value, from, to) {
  if (!value) return false;
  const day = isoDate(value);
  return day >= from && day <= to;
}

function invoiceBalance(invoice) {
  return Math.max(0, asNumber(invoice.amount) - asNumber(invoice.paid_amount));
}

function isOpenInvoice(invoice) {
  return !["void", "draft", "paid"].includes(invoice.status) && invoiceBalance(invoice) > 0;
}

function computeStaffAccrued(member, lessonCount) {
  const rate = asNumber(member.salary_rate);
  if (!member.payment_type || !rate) return 0;
  if (member.payment_type === "per_lesson") return rate * lessonCount;
  return rate;
}

function computeTenure(hiredOn) {
  if (!hiredOn) {
    return { years: 0, months: 0, totalMonths: 0, label: "—" };
  }
  const start = new Date(`${hiredOn}T12:00:00`);
  const now = new Date();
  let totalMonths =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts = [];
  if (years) parts.push(`${years} г.`);
  if (months) parts.push(`${months} мес.`);
  if (!parts.length) parts.push("< 1 мес.");
  return { years, months, totalMonths, label: parts.join(" ") };
}

function staffDisplayName(row) {
  const user = row.user || {};
  return (
    user.name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "—"
  );
}

function buildPayrollRow(item, lessonsForMonth, recordMap, period, payoutCounts) {
  const lessonCount = lessonsForMonth.filter(
    (lesson) => String(lesson.teacher) === String(item.id),
  ).length;
  const accrued = computeStaffAccrued(item, lessonCount);
  const monthRecord = recordMap.get(String(item.id));
  const paid =
    monthRecord?.status === "paid"
      ? asNumber(monthRecord.paid_amount)
      : asNumber(monthRecord?.paid_amount);
  const tenure = computeTenure(item.hired_on);
  return {
    ...item,
    customPosition: item.position || "",
    lessonCount,
    accrued,
    paid,
    remaining: Math.max(0, accrued - paid),
    name: staffDisplayName(item),
    tenure,
    payoutCount: payoutCounts.get(String(item.id)) || 0,
    monthRecord: monthRecord || null,
    monthStatus: monthRecord?.status || "unpaid",
    period,
  };
}

function salaryPatchPayload(data) {
  return {
    position: data.position || "",
    hired_on: data.hired_on || null,
    payment_type: data.payment_type || "",
    salary_rate: priceToApi(data.salary_rate || "0"),
    salary_paid_month: priceToApi(data.salary_paid_month || "0"),
    last_payout_at: data.last_payout_at ? new Date(data.last_payout_at).toISOString() : null,
    last_payout_amount: data.last_payout_amount ? priceToApi(data.last_payout_amount) : null,
  };
}

function buildSalaryForm(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    position: row.customPosition || "",
    hired_on: row.hired_on || "",
    payment_type: row.payment_type || "",
    salary_rate: row.salary_rate ? String(Math.floor(asNumber(row.salary_rate))) : "",
    salary_paid_month: row.paid ? String(Math.floor(row.paid)) : "",
    last_payout_at: toDatetimeLocal(row.monthRecord?.paid_at || row.last_payout_at),
    last_payout_amount: row.monthRecord?.paid_amount
      ? String(Math.floor(asNumber(row.monthRecord.paid_amount)))
      : row.last_payout_amount
        ? String(Math.floor(asNumber(row.last_payout_amount)))
        : "",
  };
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

function FinanceBars({ points, currency }) {
  const max = Math.max(...points.map((item) => item.amount), 1);
  return (
    <div className="finance-bars">
      {points.map((item) => (
        <div key={item.key} className="finance-bar-col" title={`${item.label}: ${money(item.amount, currency)}`}>
          <div className="finance-bar-track">
            <div
              className={`finance-bar-fill tone-${item.tone}`}
              style={{ height: `${Math.max(item.amount > 0 ? 8 : 0, Math.round((item.amount / max) * 100))}%` }}
            />
          </div>
          <span>{item.shortLabel}</span>
        </div>
      ))}
    </div>
  );
}

export default function FinancePage() {
  const slug = getSession().tenantSlug;
  const base = slug ? `/education/${slug}` : "..";
  const role = currentMembership()?.role || "";
  const canWrite = hasCapability(role, "finance.manage");
  const [pageTab, setPageTab] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [payrollSearch, setPayrollSearch] = useState("");
  const [payrollType, setPayrollType] = useState("");
  const [payrollDueOnly, setPayrollDueOnly] = useState(false);
  const [payrollStatus, setPayrollStatus] = useState("");
  const [salaryForm, setSalaryForm] = useState(null);
  const [salarySaving, setSalarySaving] = useState(false);
  const [payForm, setPayForm] = useState(null);
  const [paySaving, setPaySaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(null);

  const range = useMemo(() => monthRange(), []);
  const payrollRange = useMemo(() => monthRange(periodFirstDay(selectedMonth)), [selectedMonth]);
  const currency = invoices[0]?.currency || payments[0]?.currency || "UZS";

  const payoutCounts = useMemo(() => {
    const map = new Map();
    salaryRecords.forEach((record) => {
      if (record.status !== "paid") return;
      const key = String(record.membership);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [salaryRecords]);

  const currentPeriodRecords = useMemo(() => {
    return salaryRecords.filter((record) => record.period === range.from);
  }, [salaryRecords, range.from]);

  const selectedPeriodRecords = useMemo(() => {
    const period = periodFirstDay(selectedMonth);
    const map = new Map();
    salaryRecords
      .filter((record) => record.period === period)
      .forEach((record) => map.set(String(record.membership), record));
    return map;
  }, [salaryRecords, selectedMonth]);

  const succeededPayments = useMemo(
    () => payments.filter((item) => item.status === "succeeded"),
    [payments],
  );

  const staffRows = useMemo(() => {
    const period = periodFirstDay(selectedMonth);
    const lessonsForMonth = lessons.filter((item) =>
      inDateRange(item.starts_at, payrollRange.from, payrollRange.to),
    );
    const recordMap = selectedPeriodRecords;
    return staff.map((item) => buildPayrollRow(item, lessonsForMonth, recordMap, period, payoutCounts));
  }, [staff, lessons, payrollRange, selectedPeriodRecords, selectedMonth, payoutCounts]);

  const overviewStaffRows = useMemo(() => {
    const recordMap = new Map();
    currentPeriodRecords.forEach((record) => recordMap.set(String(record.membership), record));
    const lessonsForMonth = lessons.filter((item) =>
      inDateRange(item.starts_at, range.from, range.to),
    );
    return staff.map((item) => buildPayrollRow(item, lessonsForMonth, recordMap, range.from, payoutCounts));
  }, [staff, lessons, range, currentPeriodRecords, payoutCounts]);

  const filteredPayrollRows = useMemo(() => {
    const q = payrollSearch.trim().toLowerCase();
    return staffRows
      .filter((row) => {
        if (payrollType && row.payment_type !== payrollType) return false;
        if (payrollDueOnly && row.remaining <= 0) return false;
        if (payrollStatus === "paid" && row.monthStatus !== "paid") return false;
        if (payrollStatus === "unpaid" && row.monthStatus === "paid") return false;
        if (q && !row.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "ru"));
  }, [staffRows, payrollSearch, payrollType, payrollDueOnly, payrollStatus]);

  const monthRegisterStats = useMemo(() => {
    const baseRows = staffRows.filter((row) => row.is_active);
    const paidRows = baseRows.filter((row) => row.monthStatus === "paid");
    const unpaidRows = baseRows.filter(
      (row) => row.monthStatus !== "paid" && (row.accrued > 0 || row.payment_type),
    );
    return {
      paidCount: paidRows.length,
      unpaidCount: unpaidRows.length,
      totalStaff: baseRows.length,
      paidAmount: paidRows.reduce((sum, row) => sum + row.paid, 0),
      accruedAmount: baseRows.reduce((sum, row) => sum + row.accrued, 0),
    };
  }, [staffRows]);

  const stats = useMemo(() => {
    const collected = succeededPayments
      .filter((item) => inDateRange(item.paid_at, range.from, range.to))
      .reduce((sum, item) => sum + asNumber(item.amount), 0);

    const expected = invoices
      .filter((item) => isOpenInvoice(item) && inDateRange(item.due_at, range.from, range.to))
      .reduce((sum, item) => sum + invoiceBalance(item), 0);

    const debt = invoices
      .filter(isOpenInvoice)
      .reduce((sum, item) => sum + invoiceBalance(item), 0);

    const currentRows = staff
      .filter((item) => item.is_active)
      .map((item) => {
        const lessonCount = lessons.filter(
          (lesson) =>
            String(lesson.teacher) === String(item.id) &&
            inDateRange(lesson.starts_at, range.from, range.to),
        ).length;
        const accrued = computeStaffAccrued(item, lessonCount);
        const record = currentPeriodRecords.find((r) => String(r.membership) === String(item.id));
        const paid = record?.status === "paid" ? asNumber(record.paid_amount) : 0;
        return { accrued, paid, remaining: Math.max(0, accrued - paid) };
      });

    const payrollAccrued = currentRows.reduce((sum, item) => sum + item.accrued, 0);
    const payrollPaid = currentPeriodRecords
      .filter((record) => record.status === "paid")
      .reduce((sum, record) => sum + asNumber(record.paid_amount), 0);
    const payrollDue = currentRows.reduce((sum, item) => sum + item.remaining, 0);
    const expenses = payrollPaid;
    const wallet = collected - expenses;

    return { collected, expected, debt, payrollAccrued, payrollPaid, payrollDue, expenses, wallet };
  }, [succeededPayments, invoices, staff, lessons, range, currentPeriodRecords]);

  const flowPoints = useMemo(
    () => [
      { key: "in", label: "Поступления", shortLabel: "Приход", amount: stats.collected, tone: "green" },
      { key: "exp", label: "Расходы", shortLabel: "Расход", amount: stats.expenses, tone: "red" },
      { key: "due", label: "Ожидается", shortLabel: "Ожид.", amount: stats.expected, tone: "orange" },
      { key: "pay", label: "Зарплаты", shortLabel: "ЗП", amount: stats.payrollDue, tone: "purple" },
    ],
    [stats],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [invoiceData, paymentData, staffData, lessonData, salaryData] = await Promise.all([
        fetchAll("/invoices"),
        fetchAll("/payments"),
        fetchAll("/staff"),
        fetchAll("/lessons"),
        fetchAll("/salary-records"),
      ]);
      setInvoices(invoiceData);
      setPayments(paymentData);
      setStaff(staffData);
      setLessons(lessonData);
      setSalaryRecords(salaryData);
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

  function openSalaryEdit(row) {
    setSalaryForm(buildSalaryForm(row));
  }

  function openPayModal(row) {
    setPayForm({
      id: row.id,
      name: row.name,
      amount:
        row.remaining > 0
          ? String(Math.floor(row.remaining))
          : row.accrued > 0
            ? String(Math.floor(row.accrued))
            : "",
      paid_at: `${today()}T12:00`,
      accrued: row.accrued,
      recordId: row.monthRecord?.id || null,
    });
  }

  async function upsertSalaryRecord(payload) {
    await api.post("/salary-records", payload);
  }

  async function setMonthSalaryStatus(row, status) {
    if (!canWrite) return;
    const payoutAmount = row.accrued > 0 ? row.accrued : asNumber(row.salary_rate);
    if (status === "paid" && payoutAmount <= 0) {
      setError("Сначала укажите ставку или сумму выплаты.");
      openPayModal(row);
      return;
    }
    setActionSaving(row.id);
    setError("");
    try {
      await upsertSalaryRecord({
        membership: row.id,
        period: periodFirstDay(selectedMonth),
        accrued_amount: priceToApi(String(Math.floor(row.accrued > 0 ? row.accrued : payoutAmount))),
        status,
        paid_amount:
          status === "paid"
            ? priceToApi(String(Math.floor(payoutAmount)))
            : priceToApi("0"),
        paid_at: status === "paid" ? new Date().toISOString() : null,
      });
      setInfo(status === "paid" ? "Зарплата отмечена как получена." : "Отметка снята.");
      await load();
    } catch (err) {
      setError(err.message || "Не удалось сохранить выплату.");
    } finally {
      setActionSaving(null);
    }
  }

  async function saveSalary(event) {
    event.preventDefault();
    if (!salaryForm || !canWrite) return;
    setSalarySaving(true);
    setError("");
    try {
      await api.patch(`/staff/${salaryForm.id}`, salaryPatchPayload(salaryForm));
      const paidAmount = asNumber(priceToApi(salaryForm.salary_paid_month));
      if (paidAmount > 0) {
        await upsertSalaryRecord({
          membership: salaryForm.id,
          period: periodFirstDay(selectedMonth),
          accrued_amount: priceToApi(salaryForm.salary_rate || "0"),
          paid_amount: priceToApi(salaryForm.salary_paid_month),
          paid_at: salaryForm.last_payout_at
            ? new Date(salaryForm.last_payout_at).toISOString()
            : new Date().toISOString(),
          status: "paid",
          notes: "",
        });
      }
      setSalaryForm(null);
      setInfo("Зарплата сохранена.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSalarySaving(false);
    }
  }

  async function submitPay(event) {
    event.preventDefault();
    if (!payForm || !canWrite) return;
    const amount = asNumber(priceToApi(payForm.amount));
    if (amount <= 0) {
      setError("Укажите сумму выплаты больше нуля.");
      return;
    }
    setPaySaving(true);
    setError("");
    try {
      await upsertSalaryRecord({
        membership: payForm.id,
        period: periodFirstDay(selectedMonth),
        accrued_amount: priceToApi(String(Math.floor(payForm.accrued || amount))),
        paid_amount: priceToApi(payForm.amount),
        paid_at: new Date(payForm.paid_at).toISOString(),
        status: "paid",
      });
      setPayForm(null);
      setInfo("Выплата зарегистрирована.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaySaving(false);
    }
  }

  async function exportPayroll() {
    const { downloadExcelBook, excelStamp } = await import("@/utils/exportExcel");
    const periodTitle = monthLabel(selectedMonth);
    downloadExcelBook(`zarplata_${selectedMonth}_${excelStamp()}`, [
      {
        name: `Реестр ${selectedMonth}`,
        rows: filteredPayrollRows,
        columns: [
          { title: "Месяц", value: () => periodTitle },
          { title: "Сотрудник", value: (row) => row.name },
          { title: "Роль", value: (row) => ROLE_LABELS[row.role] || row.role },
          { title: "Должность", value: (row) => row.customPosition || "—" },
          { title: "Работает с", value: (row) => (row.hired_on ? formatDate(row.hired_on) : "—") },
          { title: "Стаж", value: (row) => row.tenure.label },
          { title: "Лет", value: (row) => row.tenure.years },
          { title: "Месяцев (всего)", value: (row) => row.tenure.totalMonths },
          { title: "Всего выплат", value: (row) => row.payoutCount },
          { title: "Тип оплаты", value: (row) => paymentTypeLabel(row.payment_type) },
          { title: "Ставка", value: (row) => row.salary_rate },
          { title: "Начислено", value: (row) => row.accrued },
          { title: "Статус месяца", value: (row) => (row.monthStatus === "paid" ? "Получил" : "Не получил") },
          { title: "Выплачено", value: (row) => row.paid },
          {
            title: "Дата выплаты",
            value: (row) => (row.monthRecord?.paid_at ? formatDate(row.monthRecord.paid_at) : ""),
          },
        ],
      },
      {
        name: "История выплат",
        rows: salaryRecords
          .filter((record) => record.status === "paid")
          .sort((a, b) => String(b.period).localeCompare(String(a.period))),
        columns: [
          { title: "Период", value: (row) => monthLabel(String(row.period).slice(0, 7)) },
          { title: "Сотрудник", value: (row) => row.staff_name || row.membership },
          { title: "Роль", value: (row) => ROLE_LABELS[row.staff_role] || row.staff_role || "—" },
          { title: "Начислено", value: (row) => row.accrued_amount },
          { title: "Выплачено", value: (row) => row.paid_amount },
          { title: "Дата", value: (row) => (row.paid_at ? formatDate(row.paid_at) : "") },
          { title: "Примечание", value: (row) => row.notes || "" },
        ],
      },
    ]);
  }

  return (
    <div className="finance-page">
      <PageHeader
        title="Финансы"
        subtitle="Поступления, кошелёк, зарплаты и расходы учебного центра"
        actions={
          <div className="finance-topbar">
            <Link className="btn btn-secondary" to={`${base}/billing`}>
              Биллинг учеников
            </Link>
            <Link className="btn btn-secondary" to={`${base}/staff`}>
              Команда
            </Link>
            <button type="button" className="btn btn-primary" onClick={exportPayroll}>
              Скачать Excel
            </button>
          </div>
        }
      />

      <div className="finance-page-tabs">
        {[
          ["overview", "Обзор"],
          ["payroll", "Зарплаты"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`finance-page-tab${pageTab === value ? " is-active" : ""}`}
            onClick={() => setPageTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <Banner>{error}</Banner>
      {loading ? <p className="finance-loading muted">Загрузка финансов…</p> : null}
      {info ? <div className="finance-toast">{info}</div> : null}

      <p className="finance-period muted">
        {pageTab === "payroll"
          ? `Реестр зарплат: ${monthLabel(selectedMonth)} (${formatDate(payrollRange.from)} — ${formatDate(payrollRange.to)})`
          : `Период: ${formatDate(range.from)} — ${formatDate(range.to)}`}
      </p>

      <div className="finance-stats">
        {KPI_DEFS.map((item) => (
          <div key={item.key} className={`finance-kpi tone-${item.tone}`}>
            <div className="finance-kpi-icon">{item.icon}</div>
            <div className="finance-kpi-value">
              <strong>{money(stats[item.key], currency)}</strong>
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      {pageTab === "overview" ? (
        <>
          <div className="finance-dashboard-grid">
            <section className="card finance-panel">
              <div className="finance-panel-head">
                <h3>Движение денег</h3>
                <span className="muted">Приход · расход · ожидания</span>
              </div>
              <FinanceBars points={flowPoints} currency={currency} />
              <div className="finance-summary-grid">
                <div>
                  <span className="muted">Поступило</span>
                  <strong>{money(stats.collected, currency)}</strong>
                </div>
                <div>
                  <span className="muted">Расходы (зарплаты)</span>
                  <strong>{money(stats.expenses, currency)}</strong>
                </div>
                <div>
                  <span className="muted">Остаток в кошельке</span>
                  <strong className={stats.wallet < 0 ? "finance-negative" : ""}>
                    {money(stats.wallet, currency)}
                  </strong>
                </div>
              </div>
              <p className="finance-note muted">
                Кошелёк = поступления от учеников за месяц минус выплаченные зарплаты.
              </p>
            </section>

            <section className="card finance-panel">
              <div className="finance-panel-head">
                <h3>Ожидаемые поступления</h3>
                <span className="muted">По счетам учеников</span>
              </div>
              <div className="finance-summary-grid">
                <div>
                  <span className="muted">К оплате в этом месяце</span>
                  <strong>{money(stats.expected, currency)}</strong>
                </div>
                <div>
                  <span className="muted">Общий долг</span>
                  <strong>{money(stats.debt, currency)}</strong>
                </div>
                <div>
                  <span className="muted">Прогноз</span>
                  <strong>{money(stats.collected + stats.expected, currency)}</strong>
                </div>
              </div>
              <Link className="btn btn-secondary" to={`${base}/billing`}>
                Открыть биллинг
              </Link>
            </section>
          </div>

          <section className="card finance-panel">
            <div className="finance-panel-head">
              <h3>Зарплаты — кратко</h3>
              <button type="button" className="text-action" onClick={() => setPageTab("payroll")}>
                Реестр зарплат →
              </button>
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Стаж</th>
                    <th>Начислено</th>
                    <th>Статус</th>
                    <th>Выплачено</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewStaffRows
                    .filter((row) => row.is_active)
                    .filter((row) => row.accrued > 0 || row.paid > 0 || row.payoutCount > 0)
                    .sort((a, b) => b.remaining - a.remaining)
                    .slice(0, 5)
                    .map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.tenure.label}</td>
                        <td>{money(row.accrued, currency)}</td>
                        <td>
                          <span
                            className={`finance-salary-badge ${row.monthStatus === "paid" ? "is-paid" : "is-unpaid"}`}
                          >
                            {row.monthStatus === "paid" ? "Получил" : "Не получил"}
                          </span>
                        </td>
                        <td>{money(row.paid, currency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {pageTab === "payroll" ? (
        <section className="card finance-panel">
          <div className="finance-panel-head">
            <h3>Реестр зарплат за месяц</h3>
            <span className="muted">
              Получили {monthRegisterStats.paidCount} из {monthRegisterStats.totalStaff} · выплачено{" "}
              {money(monthRegisterStats.paidAmount, currency)}
            </span>
          </div>

          <div className="finance-month-bar">
            <button
              type="button"
              className="finance-month-nav"
              aria-label="Предыдущий месяц"
              onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))}
            >
              ←
            </button>
            <div className="finance-month-picker">
              <strong>{monthLabel(selectedMonth)}</strong>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="finance-month-nav"
              aria-label="Следующий месяц"
              onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))}
            >
              →
            </button>
          </div>

          <div className="finance-month-stats">
            <div className="finance-month-stat tone-green">
              <strong>{monthRegisterStats.paidCount}</strong>
              <span>Получили зарплату</span>
            </div>
            <div className="finance-month-stat tone-orange">
              <strong>{monthRegisterStats.unpaidCount}</strong>
              <span>Не получили</span>
            </div>
            <div className="finance-month-stat tone-purple">
              <strong>{money(monthRegisterStats.accruedAmount, currency)}</strong>
              <span>Начислено за месяц</span>
            </div>
            <div className="finance-month-stat tone-blue">
              <strong>{money(monthRegisterStats.paidAmount, currency)}</strong>
              <span>Выплачено за месяц</span>
            </div>
          </div>

          <div className="finance-payroll-filters finance-payroll-filters-wide">
            <Field label="Поиск">
              <input
                placeholder="Имя сотрудника"
                value={payrollSearch}
                onChange={(e) => setPayrollSearch(e.target.value)}
              />
            </Field>
            <Field label="Тип оплаты">
              <select value={payrollType} onChange={(e) => setPayrollType(e.target.value)}>
                <option value="">Все</option>
                {PAYMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Статус месяца">
              <select value={payrollStatus} onChange={(e) => setPayrollStatus(e.target.value)}>
                <option value="">Все</option>
                <option value="paid">Получил</option>
                <option value="unpaid">Не получил</option>
              </select>
            </Field>
            <Field label="Фильтр">
              <label className="finance-check">
                <input
                  type="checkbox"
                  checked={payrollDueOnly}
                  onChange={(e) => setPayrollDueOnly(e.target.checked)}
                />
                Только с задолженностью
              </label>
            </Field>
          </div>

          <div className="finance-table-wrap finance-table-wrap-desktop">
            <table className="finance-table finance-payroll-table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Работает с</th>
                  <th>Стаж</th>
                  <th>Выплат (всего)</th>
                  <th>Начислено</th>
                  <th>Статус</th>
                  <th>Выплачено</th>
                  <th>Дата выплаты</th>
                  {canWrite ? <th>Действие</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredPayrollRows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.monthStatus === "paid" ? "finance-row-paid" : "finance-row-unpaid"}
                  >
                    <td>
                      <strong>{row.name}</strong>
                      <span className="muted">
                        {ROLE_LABELS[row.role] || row.role}
                        {!row.is_active ? " · неактивен" : ""}
                      </span>
                    </td>
                    <td>{row.hired_on ? formatDate(row.hired_on) : "—"}</td>
                    <td>
                      <strong>{row.tenure.label}</strong>
                      {row.tenure.years > 0 ? (
                        <span className="muted">{row.tenure.years} лет</span>
                      ) : null}
                    </td>
                    <td>
                      <span className="finance-payout-count">{row.payoutCount}</span>
                    </td>
                    <td>{money(row.accrued, currency)}</td>
                    <td>
                      <span
                        className={`finance-salary-badge ${row.monthStatus === "paid" ? "is-paid" : "is-unpaid"}`}
                      >
                        {row.monthStatus === "paid" ? "Получил" : "Не получил"}
                      </span>
                    </td>
                    <td>{money(row.paid, currency)}</td>
                    <td>
                      {row.monthRecord?.paid_at ? formatDate(row.monthRecord.paid_at) : "—"}
                    </td>
                    {canWrite ? (
                      <td>
                        <div className="finance-row-actions">
                          {row.monthStatus !== "paid" ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={actionSaving === row.id}
                              onClick={() => setMonthSalaryStatus(row, "paid")}
                            >
                              Получил
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={actionSaving === row.id}
                              onClick={() => setMonthSalaryStatus(row, "unpaid")}
                            >
                              Отменить
                            </button>
                          )}
                          <RowActionsMenu
                            items={[
                              { label: "Редактировать", onClick: () => openSalaryEdit(row) },
                              { label: "Выплата с суммой", onClick: () => openPayModal(row) },
                            ]}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="finance-payroll-cards">
            {filteredPayrollRows.map((row) => (
              <article
                key={row.id}
                className={`finance-payroll-card ${row.monthStatus === "paid" ? "is-paid" : "is-unpaid"}`}
              >
                <div className="finance-payroll-card-head">
                  <div>
                    <strong>{row.name}</strong>
                    <span className="muted">{ROLE_LABELS[row.role] || row.role}</span>
                  </div>
                  <span
                    className={`finance-salary-badge ${row.monthStatus === "paid" ? "is-paid" : "is-unpaid"}`}
                  >
                    {row.monthStatus === "paid" ? "Получил" : "Не получил"}
                  </span>
                </div>
                <div className="finance-payroll-card-grid">
                  <div>
                    <span>Работает с</span>
                    <strong>{row.hired_on ? formatDate(row.hired_on) : "—"}</strong>
                  </div>
                  <div>
                    <span>Стаж</span>
                    <strong>{row.tenure.label}</strong>
                  </div>
                  <div>
                    <span>Выплат всего</span>
                    <strong>{row.payoutCount}</strong>
                  </div>
                  <div>
                    <span>Начислено</span>
                    <strong>{money(row.accrued, currency)}</strong>
                  </div>
                  <div>
                    <span>Выплачено</span>
                    <strong>{money(row.paid, currency)}</strong>
                  </div>
                  <div>
                    <span>Дата</span>
                    <strong>
                      {row.monthRecord?.paid_at ? formatDate(row.monthRecord.paid_at) : "—"}
                    </strong>
                  </div>
                </div>
                {canWrite ? (
                  <div className="finance-payroll-card-actions">
                    {row.monthStatus !== "paid" ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={actionSaving === row.id}
                        onClick={() => setMonthSalaryStatus(row, "paid")}
                      >
                        Отметить «Получил»
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={actionSaving === row.id}
                        onClick={() => setMonthSalaryStatus(row, "unpaid")}
                      >
                        Отменить
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openPayModal(row)}
                    >
                      Сумма
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {salaryForm ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Зарплата">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => !salarySaving && setSalaryForm(null)}
          />
          <div className="sheet billing-payment-sheet">
            <div className="sheet-head">
              <div>
                <h2>Зарплата — {salaryForm.name}</h2>
                <p className="muted">
                  {ROLE_LABELS[salaryForm.role] || salaryForm.role} · {monthLabel(selectedMonth)}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                aria-label="Закрыть"
                onClick={() => !salarySaving && setSalaryForm(null)}
              >
                ×
              </button>
            </div>
            <form className="billing-payment-form-wrap" onSubmit={saveSalary}>
              <div className="sheet-body billing-payment-form">
                <div className="billing-payment-span-2">
                  <Field label="Должность">
                    <input
                      value={salaryForm.position}
                      onChange={(e) => setSalaryForm({ ...salaryForm, position: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Дата найма">
                  <input
                    type="date"
                    value={salaryForm.hired_on || ""}
                    onChange={(e) => setSalaryForm({ ...salaryForm, hired_on: e.target.value })}
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
                    onChange={(value) => setSalaryForm({ ...salaryForm, salary_rate: value })}
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
                <Field label="Дата выплаты">
                  <input
                    type="datetime-local"
                    value={salaryForm.last_payout_at}
                    onChange={(e) =>
                      setSalaryForm({ ...salaryForm, last_payout_at: e.target.value })
                    }
                  />
                </Field>
                <Field label="Сумма выплаты (UZS)">
                  <MoneyInput
                    value={salaryForm.last_payout_amount}
                    onChange={(value) =>
                      setSalaryForm({ ...salaryForm, last_payout_amount: value })
                    }
                  />
                </Field>
              </div>
              <div className="sheet-foot billing-payment-foot">
                <Button type="submit" disabled={salarySaving}>
                  {salarySaving ? "Сохранение…" : "Сохранить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {payForm ? (
        <div className="overlay overlay-nested" role="dialog" aria-modal="true" aria-label="Выплата">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => !paySaving && setPayForm(null)}
          />
          <div className="sheet billing-payment-sheet">
            <div className="sheet-head">
              <div>
                <h2>Выплата — {payForm.name}</h2>
                <p className="muted">
                  {monthLabel(selectedMonth)} · регистрация выплаты
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                aria-label="Закрыть"
                onClick={() => !paySaving && setPayForm(null)}
              >
                ×
              </button>
            </div>
            <form className="billing-payment-form-wrap" onSubmit={submitPay}>
              <div className="sheet-body billing-payment-form">
                <Field label="Сумма выплаты (UZS)">
                  <MoneyInput
                    required
                    value={payForm.amount}
                    onChange={(value) => setPayForm({ ...payForm, amount: value })}
                  />
                </Field>
                <Field label="Дата выплаты">
                  <input
                    type="datetime-local"
                    required
                    value={payForm.paid_at}
                    onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sheet-foot billing-payment-foot">
                <Button type="submit" disabled={paySaving}>
                  {paySaving ? "Сохранение…" : "Зарегистрировать выплату"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
