import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Button, DataTable, PageHeader, StatCard } from "@/components/ui";
import { LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import {
  listPlatformPlans,
  listPlatformTenants,
  platformStudentsSummary,
} from "@/services/tenant";
import { formatDate, money } from "@/utils/format";

export default function AnalyticsPage() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [centers, catalog, studentsSummary] = await Promise.all([
          listPlatformTenants(),
          listPlatformPlans(),
          platformStudentsSummary(),
        ]);
        setTenants(centers);
        setPlans(catalog);
        setSummary(studentsSummary);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  const mrr = tenants.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0);
  const studentsTotal = tenants.reduce((sum, row) => sum + Number(row.student_count || 0), 0);
  const staffTotal = tenants.reduce((sum, row) => sum + Number(row.staff_count || 0), 0);
  const paid = tenants.filter((row) => row.license_status === "active").length;
  const trial = tenants.filter((row) => row.license_status === "trial").length;
  const expired = tenants.filter((row) => row.license_status === "expired").length;
  const fullPack = tenants.filter((row) => row.includes_crm && row.includes_app).length;
  const crmOnly = tenants.filter((row) => row.includes_crm && !row.includes_app).length;
  const appOnly = tenants.filter((row) => row.includes_app && !row.includes_crm).length;

  const byPlan = useMemo(() => {
    const map = {};
    plans.forEach((plan) => {
      map[plan.code] = {
        code: plan.code,
        name: plan.name,
        centers: 0,
        students: 0,
        mrr: 0,
      };
    });
    tenants.forEach((row) => {
      if (!map[row.plan]) {
        map[row.plan] = {
          code: row.plan,
          name: PLAN_LABELS[row.plan] || row.plan,
          centers: 0,
          students: 0,
          mrr: 0,
        };
      }
      map[row.plan].centers += 1;
      map[row.plan].students += Number(row.student_count || 0);
      map[row.plan].mrr += Number(row.monthly_price || 0);
    });
    return Object.values(map).sort((a, b) => b.centers - a.centers);
  }, [tenants, plans]);

  const topCenters = useMemo(
    () =>
      [...tenants]
        .sort((a, b) => Number(b.student_count || 0) - Number(a.student_count || 0))
        .slice(0, 10),
    [tenants],
  );

  function planName(code) {
    return plans.find((item) => item.code === code)?.name || PLAN_LABELS[code] || code;
  }

  async function exportAnalytics() {
    if (!tenants.length) {
      setError("Нет данных для экспорта.");
      return;
    }
    setError("");
    setExporting(true);
    try {
      const { downloadExcelBook, excelStamp } = await import("@/utils/exportExcel");
      downloadExcelBook(`yagona-analitika_${excelStamp()}.xlsx`, [
        {
          name: "Сводка",
          rows: [
            { metric: "Центры", value: tenants.length },
            { metric: "Оплачено", value: paid },
            { metric: "Пробный", value: trial },
            { metric: "Истекло", value: expired },
            { metric: "MRR", value: mrr },
            { metric: "Ученики (сводка)", value: summary?.students ?? studentsTotal },
            { metric: "Ученики активные", value: summary?.active ?? "" },
            {
              metric: "С абонементом",
              value: summary?.with_active_subscription ?? "",
            },
            {
              metric: "Истёк абонемент",
              value: summary?.expired_subscription ?? "",
            },
            { metric: "Сотрудники", value: staffTotal },
            { metric: "Полный пакет CRM+App", value: fullPack },
            { metric: "Только CRM", value: crmOnly },
            { metric: "Только приложение", value: appOnly },
          ],
          columns: [
            { key: "metric", title: "Показатель" },
            { key: "value", title: "Значение" },
          ],
        },
        {
          name: "По тарифам",
          rows: byPlan,
          columns: [
            { key: "name", title: "Тариф" },
            { key: "code", title: "Код" },
            { key: "centers", title: "Центры" },
            { key: "students", title: "Ученики" },
            { key: "mrr", title: "MRR" },
          ],
        },
        {
          name: "Центры",
          rows: tenants,
          columns: [
            { key: "name", title: "Центр" },
            { key: "slug", title: "Slug" },
            { key: "city", title: "Город", value: (row) => row.city || "" },
            { key: "plan", title: "Тариф", value: (row) => planName(row.plan) },
            {
              key: "monthly_price",
              title: "Цена / мес",
              value: (row) => Number(row.monthly_price || 0),
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
              key: "student_count",
              title: "Ученики",
              value: (row) => row.student_count ?? 0,
            },
            {
              key: "staff_count",
              title: "Сотрудники",
              value: (row) => row.staff_count ?? 0,
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
        eyebrow="Аналитика"
        title="Аналитика платформы"
        subtitle="Центры, тарифы, ученики и выручка в одном обзоре."
        actions={
          <div className="actions">
            <Button
              type="button"
              className="secondary"
              busy={exporting}
              disabled={!tenants.length}
              onClick={exportAnalytics}
            >
              Скачать Excel
            </Button>
            <Link className="btn secondary" to="/super">
              Обзор
            </Link>
            <Link className="btn" to="/super/centers">
              Центры
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>

      <section className="section-block">
        <div className="section-head">
          <h3>Ключевые метрики</h3>
        </div>
        <div className="grid cols-4">
          <StatCard label="Центры" value={tenants.length} hint={`${paid} оплачено`} />
          <StatCard label="Ученики" value={summary?.students ?? studentsTotal} />
          <StatCard label="Сотрудники" value={staffTotal} />
          <StatCard label="MRR" value={money(mrr)} />
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h3>Лицензии и продукты</h3>
        </div>
        <div className="grid cols-4">
          <StatCard label="Оплачено" value={paid} />
          <StatCard label="Пробный" value={trial} />
          <StatCard label="Истекло" value={expired} />
          <StatCard label="Полный пакет" value={fullPack} hint={`CRM ${crmOnly} · App ${appOnly}`} />
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h3>Ученики платформы</h3>
          <Link className="text-action" to="/super/students">
            Реестр
          </Link>
        </div>
        <div className="grid cols-4">
          <StatCard label="Всего" value={summary?.students ?? "—"} />
          <StatCard label="Активные" value={summary?.active ?? "—"} />
          <StatCard label="С абонементом" value={summary?.with_active_subscription ?? "—"} />
          <StatCard label="Истёк абонемент" value={summary?.expired_subscription ?? "—"} />
        </div>
      </section>

      <div className="grid cols-2" style={{ gap: 16, alignItems: "start" }}>
        <section className="card">
          <div className="section-head">
            <h3>По тарифам</h3>
            <Button
              type="button"
              className="secondary compact"
              busy={exporting}
              disabled={!tenants.length}
              onClick={exportAnalytics}
            >
              Excel
            </Button>
          </div>
          <DataTable
            rows={byPlan}
            empty="Нет данных"
            columns={[
              { key: "name", title: "Тариф" },
              { key: "centers", title: "Центры" },
              { key: "students", title: "Ученики" },
              {
                key: "mrr",
                title: "MRR",
                render: (row) => money(row.mrr),
              },
            ]}
          />
        </section>

        <section className="card">
          <div className="section-head">
            <h3>Топ центров по ученикам</h3>
          </div>
          <DataTable
            rows={topCenters}
            empty="Нет данных"
            columns={[
              { key: "name", title: "Центр" },
              { key: "student_count", title: "Ученики" },
              { key: "staff_count", title: "Сотрудники" },
              {
                key: "plan",
                title: "Тариф",
                render: (row) => planName(row.plan),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
