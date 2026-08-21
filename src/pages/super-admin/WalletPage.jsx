import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Badge, Button, DataTable, PageHeader, StatCard } from "@/components/ui";
import { CYCLE_LABELS, LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import { listPlatformPlans, listPlatformTenants } from "@/services/tenant";
import { formatDate, money } from "@/utils/format";

export default function WalletPage() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [centers, catalog] = await Promise.all([
          listPlatformTenants(),
          listPlatformPlans(),
        ]);
        setTenants(centers);
        setPlans(catalog);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  const mrr = useMemo(
    () => tenants.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0),
    [tenants],
  );
  const paidMrr = useMemo(
    () =>
      tenants
        .filter((row) => row.license_status === "active")
        .reduce((sum, row) => sum + Number(row.monthly_price || 0), 0),
    [tenants],
  );
  const atRisk = tenants.filter(
    (row) => row.license_status === "expired" || row.license_status === "suspended",
  ).length;

  function planName(code) {
    return plans.find((item) => item.code === code)?.name || PLAN_LABELS[code] || code;
  }

  const rows = useMemo(
    () =>
      [...tenants].sort(
        (a, b) => Number(b.monthly_price || 0) - Number(a.monthly_price || 0),
      ),
    [tenants],
  );

  async function exportPayments() {
    if (!rows.length) {
      setError("Нет данных для экспорта.");
      return;
    }
    setError("");
    setExporting(true);
    try {
      const { downloadExcelBook, excelStamp } = await import("@/utils/exportExcel");
      downloadExcelBook(`yagona-oplaty_${excelStamp()}.xlsx`, [
        {
          name: "Сводка",
          rows: [
            { metric: "MRR всего", value: mrr },
            { metric: "MRR оплаченных", value: paidMrr },
            { metric: "Центров", value: tenants.length },
            { metric: "Риск (истекло/отключено)", value: atRisk },
            {
              metric: "Оплачено центров",
              value: tenants.filter((row) => row.license_status === "active").length,
            },
            {
              metric: "Пробных",
              value: tenants.filter((row) => row.license_status === "trial").length,
            },
            {
              metric: "Истекших",
              value: tenants.filter((row) => row.license_status === "expired").length,
            },
          ],
          columns: [
            { key: "metric", title: "Показатель" },
            { key: "value", title: "Значение" },
          ],
        },
        {
          name: "Оплаты по центрам",
          rows,
          columns: [
            { key: "name", title: "Центр" },
            { key: "slug", title: "Slug" },
            { key: "city", title: "Город", value: (row) => row.city || "" },
            {
              key: "plan",
              title: "Тариф",
              value: (row) => planName(row.plan),
            },
            {
              key: "billing_cycle",
              title: "Цикл",
              value: (row) => CYCLE_LABELS[row.billing_cycle] || row.billing_cycle || "",
            },
            {
              key: "monthly_price",
              title: "Цена / мес",
              value: (row) => Number(row.monthly_price || 0),
            },
            {
              key: "currency",
              title: "Валюта",
              value: (row) => row.currency || "UZS",
            },
            {
              key: "licensed_from",
              title: "С",
              value: (row) => (row.licensed_from ? formatDate(row.licensed_from) : ""),
            },
            {
              key: "licensed_until",
              title: "Оплачено до",
              value: (row) => (row.licensed_until ? formatDate(row.licensed_until) : ""),
            },
            {
              key: "license_status",
              title: "Статус",
              value: (row) => LICENSE_LABELS[row.license_status] || row.license_status || "",
            },
            {
              key: "products",
              title: "Продукты",
              value: (row) =>
                [row.includes_crm ? "CRM" : null, row.includes_app ? "Приложение" : null]
                  .filter(Boolean)
                  .join(" + "),
            },
            {
              key: "contract_number",
              title: "Договор",
              value: (row) => row.contract_number || "",
            },
            {
              key: "student_count",
              title: "Ученики",
              value: (row) => row.student_count ?? 0,
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

  return (
    <div>
      <PageHeader
        eyebrow="Биллинг"
        title="Кошелёк"
        subtitle="Выручка платформы по тарифам учебных центров (MRR)."
        actions={
          <div className="actions">
            <Button
              type="button"
              className="secondary"
              busy={exporting}
              disabled={!rows.length}
              onClick={exportPayments}
            >
              Скачать Excel
            </Button>
            <Link className="btn secondary" to="/super/plans">
              Тарифы
            </Link>
            <Link className="btn" to="/super/licenses">
              Лицензии
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="MRR всего" value={money(mrr)} hint="сумма всех центров" />
        <StatCard label="MRR оплаченных" value={money(paidMrr)} hint="только active" />
        <StatCard label="Центров" value={tenants.length} />
        <StatCard label="Риск" value={atRisk} hint="истекло / отключено" />
      </div>

      <section className="card">
        <div className="section-head">
          <h3>Доход по центрам</h3>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="muted">Сортировка по цене / мес</span>
            <Button
              type="button"
              className="secondary compact"
              busy={exporting}
              disabled={!rows.length}
              onClick={exportPayments}
            >
              Excel
            </Button>
          </div>
        </div>
        <DataTable
          rows={rows}
          empty="Центров пока нет"
          columns={[
            {
              key: "name",
              title: "Центр",
              render: (row) => (
                <div className="center-cell">
                  <strong>{row.name}</strong>
                  <span>{planName(row.plan)}</span>
                </div>
              ),
            },
            {
              key: "monthly_price",
              title: "Цена / мес",
              render: (row) => money(row.monthly_price, row.currency || "UZS"),
            },
            {
              key: "licensed_until",
              title: "Оплачено до",
              render: (row) => formatDate(row.licensed_until),
            },
            {
              key: "license_status",
              title: "Статус",
              render: (row) => (
                <Badge
                  value={row.license_status}
                  label={LICENSE_LABELS[row.license_status] || row.license_status}
                />
              ),
            },
            {
              key: "products",
              title: "Продукты",
              render: (row) =>
                [row.includes_crm ? "CRM" : null, row.includes_app ? "App" : null]
                  .filter(Boolean)
                  .join(" + ") || "—",
            },
          ]}
        />
      </section>
    </div>
  );
}
