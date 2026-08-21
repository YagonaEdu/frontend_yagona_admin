import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banner,
  Badge,
  DataTable,
  PageHeader,
  StatCard,
  TextAction,
} from "@/components/ui";
import { CYCLE_LABELS, LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import {
  enterEducationCenter,
  listPlatformPlans,
  listPlatformTenants,
  patchPlatformTenant,
} from "@/services/tenant";
import { addDays, formatDate, money } from "@/utils/format";
import { educationHomePath } from "@/utils/routes";

function planLabel(code, plans) {
  const found = plans.find((item) => item.code === code);
  return found?.name || PLAN_LABELS[code] || code;
}

export default function LicensesPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState("");

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

  useEffect(() => {
    load();
  }, []);

  async function extend(row) {
    setError("");
    setInfo("");
    setBusyId(row.id);
    try {
      await patchPlatformTenant(row.id, {
        licensed_until: addDays(row.licensed_until, 30),
        is_active: true,
      });
      setInfo(`«${row.name}»: +30 дней`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function setPlan(row, planCode) {
    setError("");
    setInfo("");
    setBusyId(row.id);
    try {
      const catalog = plans.find((item) => item.code === planCode);
      await patchPlatformTenant(row.id, {
        plan: planCode,
        is_active: true,
        ...(catalog
          ? {
              monthly_price: catalog.default_monthly_price,
              billing_cycle: catalog.default_billing_cycle,
              includes_crm: catalog.includes_crm,
              includes_app: catalog.includes_app,
            }
          : {}),
      });
      setInfo(`«${row.name}»: тариф ${planLabel(planCode, plans)}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function toggleProduct(row, key) {
    const nextCrm = key === "includes_crm" ? !row.includes_crm : row.includes_crm !== false;
    const nextApp = key === "includes_app" ? !row.includes_app : row.includes_app !== false;
    if (!nextCrm && !nextApp) {
      setError("Нужно оставить хотя бы CRM или приложение");
      return;
    }
    setError("");
    setBusyId(row.id);
    try {
      await patchPlatformTenant(row.id, {
        includes_crm: nextCrm,
        includes_app: nextApp,
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  function openCenter(row) {
    enterEducationCenter(row.id, row.slug);
    navigate(educationHomePath(row.slug));
  }

  const activePlans = plans.filter((item) => item.is_active);
  const paid = tenants.filter((row) => row.license_status === "active").length;
  const trial = tenants.filter((row) => row.license_status === "trial").length;
  const expired = tenants.filter((row) => row.license_status === "expired").length;
  const fullPack = tenants.filter((row) => row.includes_crm && row.includes_app).length;

  const planCounts = useMemo(() => {
    const counts = {};
    plans.forEach((plan) => {
      counts[plan.code] = Number(plan.centers_count || 0);
    });
    tenants.forEach((row) => {
      if (counts[row.plan] == null) counts[row.plan] = 0;
    });
    return counts;
  }, [plans, tenants]);

  return (
    <div>
      <PageHeader
        eyebrow="Биллинг"
        title="Лицензии"
        subtitle="Назначение тарифов и продуктов учебным центрам."
        actions={
          <div className="actions">
            <Link className="btn secondary" to="/super/centers">
              Центры
            </Link>
            <Link className="btn" to="/super/plans">
              Новый тариф
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Оплачено" value={paid} />
        <StatCard label="Пробный" value={trial} />
        <StatCard label="Истекло" value={expired} />
        <StatCard
          label="MRR"
          value={money(tenants.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0))}
        />
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <h3>Тарифные планы</h3>
          <Link className="btn secondary compact" to="/super/plans">
            Управление тарифами
          </Link>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Создание планов — в разделе «Тарифы». Здесь назначаете их центрам.
        </p>
        <div className="plan-board">
          {activePlans.map((plan) => (
            <Link key={plan.id} className="plan-card" to="/super/plans">
              <span className="plan-card-label">{plan.name}</span>
              <strong>{planCounts[plan.code] || 0}</strong>
              <span className="muted">центров</span>
            </Link>
          ))}
          <div className="plan-card is-static">
            <span className="plan-card-label">Полный пакет</span>
            <strong>{fullPack}</strong>
            <span className="muted">CRM + приложение</span>
          </div>
        </div>
      </section>

      <div className="card">
        <div className="section-head">
          <h3>Центры и лицензии</h3>
        </div>
        <DataTable
          rows={tenants}
          empty="Нет данных"
          columns={[
            {
              key: "name",
              title: "Центр",
              render: (row) => (
                <div className="center-cell">
                  <strong>{row.name}</strong>
                  <span>{row.city || row.slug || "—"}</span>
                </div>
              ),
            },
            {
              key: "plan",
              title: "Тариф",
              render: (row) => (
                <div className="plan-inline">
                  {activePlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={`plan-mini${row.plan === plan.code ? " is-on" : ""}`}
                      disabled={busyId === row.id}
                      onClick={() => setPlan(row, plan.code)}
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>
              ),
            },
            {
              key: "products",
              title: "Подключено",
              render: (row) => (
                <div className="product-chips is-editable">
                  <button
                    type="button"
                    className={`product-chip is-btn${row.includes_crm ? " is-on" : ""}`}
                    disabled={busyId === row.id}
                    onClick={() => toggleProduct(row, "includes_crm")}
                  >
                    CRM
                  </button>
                  <button
                    type="button"
                    className={`product-chip is-btn${row.includes_app ? " is-on" : ""}`}
                    disabled={busyId === row.id}
                    onClick={() => toggleProduct(row, "includes_app")}
                  >
                    Приложение
                  </button>
                </div>
              ),
            },
            {
              key: "billing_cycle",
              title: "Цикл",
              render: (row) => CYCLE_LABELS[row.billing_cycle] || row.billing_cycle,
            },
            {
              key: "monthly_price",
              title: "Цена / мес",
              render: (row) => money(row.monthly_price, row.currency || "UZS"),
            },
            {
              key: "licensed_until",
              title: "До",
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
              key: "actions",
              title: "",
              render: (row) => (
                <div className="table-actions">
                  <TextAction onClick={() => extend(row)}>+30 дней</TextAction>
                  <TextAction onClick={() => navigate(`/super/centers?id=${row.id}`)}>
                    Карточка
                  </TextAction>
                  <TextAction onClick={() => openCenter(row)}>Кабинет</TextAction>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
