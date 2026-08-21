import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banner,
  Button,
  Field,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { CYCLE_LABELS } from "@/constants";
import {
  createPlatformPlan,
  listPlatformPlans,
  listPlatformTenants,
  updatePlatformPlan,
} from "@/services/tenant";
import { money } from "@/utils/format";

const emptyPlanForm = {
  code: "",
  name: "",
  description: "",
  default_monthly_price: "0",
  default_billing_cycle: "yearly",
  duration_days: "",
  is_trial: false,
  includes_crm: true,
  includes_app: true,
  is_active: true,
  sort_order: "100",
};

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState(emptyPlanForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [catalog, centers] = await Promise.all([
        listPlatformPlans(),
        listPlatformTenants(),
      ]);
      setPlans(catalog);
      setTenants(centers);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingPlan(null);
    setForm(emptyPlanForm);
    setOpenForm(true);
  }

  function openEdit(plan) {
    setEditingPlan(plan);
    setForm({
      code: plan.code || "",
      name: plan.name || "",
      description: plan.description || "",
      default_monthly_price: String(plan.default_monthly_price ?? "0"),
      default_billing_cycle: plan.default_billing_cycle || "yearly",
      duration_days: plan.duration_days != null ? String(plan.duration_days) : "",
      is_trial: Boolean(plan.is_trial),
      includes_crm: plan.includes_crm !== false,
      includes_app: plan.includes_app !== false,
      is_active: plan.is_active !== false,
      sort_order: String(plan.sort_order ?? 100),
    });
    setOpenForm(true);
  }

  function closeForm() {
    setOpenForm(false);
    setEditingPlan(null);
    setForm(emptyPlanForm);
  }

  async function savePlan(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Укажите название тарифа");
      return;
    }
    if (!editingPlan && !form.code.trim()) {
      setError("Укажите код тарифа (латиница), например premium");
      return;
    }
    if (!form.includes_crm && !form.includes_app) {
      setError("Выберите CRM и/или приложение");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        default_monthly_price: form.default_monthly_price || "0",
        default_billing_cycle: form.default_billing_cycle,
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        is_trial: form.is_trial,
        includes_crm: form.includes_crm,
        includes_app: form.includes_app,
        is_active: form.is_active,
        sort_order: Number(form.sort_order || 100),
      };
      if (editingPlan) {
        await updatePlatformPlan(editingPlan.id, payload);
        setInfo(`Тариф «${payload.name}» обновлён.`);
      } else {
        await createPlatformPlan({ ...payload, code: form.code.trim() });
        setInfo(`Тариф «${payload.name}» создан.`);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setPlanActive(plan, isActive) {
    setError("");
    setInfo("");
    try {
      await updatePlatformPlan(plan.id, { is_active: isActive });
      setInfo(`Тариф «${plan.name}» ${isActive ? "включён" : "отключён"}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const activeCount = plans.filter((item) => item.is_active).length;
  const trialCount = plans.filter((item) => item.is_trial && item.is_active).length;
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
        title="Тарифы"
        subtitle="Каталог тарифных планов платформы. Здесь создаёте новые тарифы."
        actions={
          <div className="actions">
            <Link className="btn secondary" to="/super/licenses">
              Лицензии центров
            </Link>
            <Button type="button" onClick={openCreate}>
              Новый тариф
            </Button>
          </div>
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Тарифов" value={plans.length} />
        <StatCard label="Активных" value={activeCount} />
        <StatCard label="Пробных" value={trialCount} />
        <StatCard label="Центров" value={tenants.length} />
      </div>

      <section className="card">
        <div className="section-head">
          <h3>Каталог тарифов</h3>
          <Button type="button" className="secondary compact" onClick={openCreate}>
            Создать тариф
          </Button>
        </div>
        {plans.length ? (
          <div className="plan-catalog">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`plan-catalog-card${!plan.is_active ? " is-off" : ""}`}
              >
                <div className="plan-catalog-top">
                  <div>
                    <strong>{plan.name}</strong>
                    <span>
                      код: {plan.code}
                      {plan.is_trial ? " · пробный" : ""}
                      {!plan.is_active ? " · отключён" : ""}
                    </span>
                  </div>
                  <em>{planCounts[plan.code] || 0} центров</em>
                </div>
                <p>{plan.description || "Без описания"}</p>
                <div className="product-chips">
                  <span className={`product-chip${plan.includes_crm ? " is-on" : ""}`}>CRM</span>
                  <span className={`product-chip${plan.includes_app ? " is-on" : ""}`}>
                    Приложение
                  </span>
                </div>
                <div className="plan-catalog-meta">
                  <span>{money(plan.default_monthly_price)} / мес</span>
                  <span>{CYCLE_LABELS[plan.default_billing_cycle] || plan.default_billing_cycle}</span>
                  <span>
                    {plan.duration_days ? `${plan.duration_days} дн.` : "по циклу оплаты"}
                  </span>
                </div>
                <div className="table-actions">
                  <Button type="button" className="secondary compact" onClick={() => openEdit(plan)}>
                    Изменить
                  </Button>
                  {plan.is_active ? (
                    <Button
                      type="button"
                      className="secondary compact"
                      onClick={() => setPlanActive(plan, false)}
                    >
                      Отключить
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="compact"
                      onClick={() => setPlanActive(plan, true)}
                    >
                      Включить
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Тарифов пока нет — создайте первый.</p>
        )}
      </section>

      {openForm ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Тариф">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={closeForm} />
          <form className="sheet" onSubmit={savePlan}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Каталог</div>
                <h2>{editingPlan ? "Изменить тариф" : "Новый тариф"}</h2>
                <p className="muted">План для учебных центров платформы Yagona.</p>
              </div>
              <button type="button" className="sheet-close" onClick={closeForm} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="grid cols-2" style={{ gap: 12 }}>
                <Field label="Название *">
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </Field>
                <Field label="Код *">
                  <input
                    value={form.code}
                    onChange={(e) => setField("code", e.target.value)}
                    placeholder="premium"
                    disabled={Boolean(editingPlan)}
                  />
                </Field>
                <Field label="Цена по умолчанию / мес">
                  <input
                    value={form.default_monthly_price}
                    onChange={(e) => setField("default_monthly_price", e.target.value)}
                  />
                </Field>
                <Field label="Цикл по умолчанию">
                  <select
                    value={form.default_billing_cycle}
                    onChange={(e) => setField("default_billing_cycle", e.target.value)}
                  >
                    <option value="monthly">Ежемесячно</option>
                    <option value="yearly">Ежегодно</option>
                  </select>
                </Field>
                <Field label="Срок лицензии, дней">
                  <input
                    value={form.duration_days}
                    onChange={(e) => setField("duration_days", e.target.value)}
                    placeholder="Пусто = по циклу"
                  />
                </Field>
                <Field label="Порядок">
                  <input
                    value={form.sort_order}
                    onChange={(e) => setField("sort_order", e.target.value)}
                  />
                </Field>
                <Field label="Описание">
                  <input
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                  />
                </Field>
              </div>
              <div className="product-picks" style={{ marginTop: 14 }}>
                <label className={`product-pick${form.includes_crm ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.includes_crm}
                    onChange={(e) => setField("includes_crm", e.target.checked)}
                  />
                  <strong>CRM</strong>
                  <span>По умолчанию в тарифе</span>
                </label>
                <label className={`product-pick${form.includes_app ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.includes_app}
                    onChange={(e) => setField("includes_app", e.target.checked)}
                  />
                  <strong>Приложение</strong>
                  <span>По умолчанию в тарифе</span>
                </label>
                <label className={`product-pick${form.is_trial ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.is_trial}
                    onChange={(e) => setField("is_trial", e.target.checked)}
                  />
                  <strong>Пробный</strong>
                  <span>Статус лицензии = пробный</span>
                </label>
              </div>
            </div>
            <div className="wizard-actions sheet-foot">
              <Button type="button" className="secondary" onClick={closeForm}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                {editingPlan ? "Сохранить" : "Создать тариф"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
