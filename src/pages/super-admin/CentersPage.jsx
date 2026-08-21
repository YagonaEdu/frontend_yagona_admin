import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Banner,
  Badge,
  Button,
  DataTable,
  Field,
  FiltersBar,
  PageHeader,
  StatCard,
  TextAction,
} from "@/components/ui";
import { CYCLE_LABELS, LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import {
  createPlatformTenant,
  enterEducationCenter,
  getPlatformTenant,
  listPlatformPlans,
  listPlatformTenants,
  patchPlatformTenant,
  updatePlatformTenant,
} from "@/services/tenant";
import {
  addDays,
  formatDate,
  formatUzPhone,
  looksLikeEmail,
  mediaUrl,
  money,
} from "@/utils/format";
import { educationHomePath } from "@/utils/routes";

const STEPS = [
  { id: 1, title: "Центр", hint: "Юр. данные" },
  { id: 2, title: "Владелец", hint: "Доступ" },
  { id: 3, title: "Лицензия", hint: "Тариф" },
  { id: 4, title: "Договор", hint: "Документы" },
];

const DOC_KIND_LABELS = {
  contract: "Договор",
  license: "Лицензия",
  passport: "Паспорт / доверенность",
  other: "Доп. документ",
};

const PLAN_OPTIONS = [
  { value: "trial", label: "Пробный", hint: "14 дней" },
  { value: "start", label: "Старт", hint: "Базовый пакет" },
  { value: "business", label: "Бизнес", hint: "Полный пакет" },
];

function planOptionsFromCatalog(plans) {
  if (!plans?.length) return PLAN_OPTIONS;
  return plans
    .filter((item) => item.is_active)
    .map((item) => ({
      value: item.code,
      label: item.name,
      hint: item.description || (item.is_trial ? "Пробный" : money(item.default_monthly_price)),
    }));
}

const emptyForm = {
  name: "",
  slug: "",
  legal_name: "",
  legal_address: "",
  city: "",
  contact_phone: "",
  stir: "",
  director_name: "",
  owner_email: "",
  owner_phone: "",
  owner_password: "",
  owner_first_name: "",
  owner_last_name: "",
  plan: "business",
  billing_cycle: "yearly",
  monthly_price: "1500000",
  licensed_until: "",
  includes_crm: true,
  includes_app: true,
  contract_number: "",
  contract_signed_on: "",
  notes: "",
};

const emptyFiles = {
  contract_file: null,
  license_file: null,
  passport_file: null,
  other_file: null,
};

const emptyTariff = {
  plan: "business",
  billing_cycle: "yearly",
  monthly_price: "0",
  licensed_until: "",
  includes_crm: true,
  includes_app: true,
};

function splitOwnerName(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function tenantToForm(tenant) {
  const owner = tenant.owner || {};
  const { first, last } = splitOwnerName(owner.name);
  return {
    name: tenant.name || "",
    slug: tenant.slug || "",
    legal_name: tenant.legal_name || "",
    legal_address: tenant.legal_address || "",
    city: tenant.city || "",
    contact_phone: tenant.contact_phone || "",
    stir: tenant.stir || "",
    director_name: tenant.director_name || "",
    owner_email: owner.email || "",
    owner_phone: owner.phone || "",
    owner_password: "",
    owner_first_name: first,
    owner_last_name: last,
    plan: tenant.plan || "business",
    billing_cycle: tenant.billing_cycle || "yearly",
    monthly_price: tenant.monthly_price != null ? String(tenant.monthly_price) : "0",
    licensed_until: toDateInput(tenant.licensed_until),
    includes_crm: tenant.includes_crm !== false,
    includes_app: tenant.includes_app !== false,
    contract_number: tenant.contract_number || "",
    contract_signed_on: toDateInput(tenant.contract_signed_on),
    notes: tenant.notes || "",
  };
}

function tenantToTariff(tenant) {
  return {
    plan: tenant.plan || "business",
    billing_cycle: tenant.billing_cycle || "yearly",
    monthly_price: tenant.monthly_price != null ? String(tenant.monthly_price) : "0",
    licensed_until: toDateInput(tenant.licensed_until),
    includes_crm: tenant.includes_crm !== false,
    includes_app: tenant.includes_app !== false,
  };
}

function hasContractFile(documents = [], deleteDocIds = [], newFile = null) {
  if (newFile) return true;
  return documents.some((doc) => doc.kind === "contract" && !deleteDocIds.includes(doc.id));
}

function productsOf(row) {
  const items = [];
  if (row.includes_crm) items.push("CRM");
  if (row.includes_app) items.push("приложение");
  return items.length ? items.join(" + ") : "—";
}

function ProductChips({ row }) {
  return (
    <div className="product-chips">
      <span className={`product-chip${row.includes_crm ? " is-on" : ""}`}>CRM</span>
      <span className={`product-chip${row.includes_app ? " is-on" : ""}`}>Приложение</span>
    </div>
  );
}

function FileDrop({ label, hint, file, onChange, accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" }) {
  return (
    <label className={`file-drop${file ? " has-file" : ""}`}>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <span className="file-drop-mark" aria-hidden="true" />
      <strong>{label}</strong>
      <span>{file ? file.name : hint}</span>
      {file ? (
        <button
          type="button"
          className="text-action inline"
          onClick={(event) => {
            event.preventDefault();
            onChange(null);
          }}
        >
          Убрать
        </button>
      ) : null}
    </label>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

export default function CentersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState(emptyFiles);
  const [step, setStep] = useState(1);
  const [openWizard, setOpenWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [existingDocs, setExistingDocs] = useState([]);
  const [deleteDocIds, setDeleteDocIds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [tariffTarget, setTariffTarget] = useState(null);
  const [tariff, setTariff] = useState(emptyTariff);

  async function load() {
    setError("");
    try {
      const [list, catalog] = await Promise.all([listPlatformTenants(), listPlatformPlans()]);
      setTenants(list);
      setPlans(catalog);
      if (selected) {
        const fresh = list.find((item) => item.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    openCreateWizard();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !tenants.length) return;
    const row = tenants.find((item) => String(item.id) === String(id));
    if (row) {
      openDetails(row);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, tenants, setSearchParams]);

  useEffect(() => {
    if (!openWizard && !selected && !tariffTarget) return undefined;
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (openWizard) resetWizard();
      else if (tariffTarget) closeTariff();
      else setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openWizard, selected, tariffTarget]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setPhoneField(key, value) {
    if (!value || looksLikeEmail(value)) {
      setField(key, value);
      return;
    }
    setField(key, formatUzPhone(value));
  }

  function validateStep(current, mode = wizardMode) {
    const next = {};
    const isEdit = mode === "edit";
    if (current === 1) {
      if (!form.name.trim()) next.name = "Укажите название центра";
      if (!form.legal_name.trim()) next.legal_name = "Укажите юридическое название";
      if (!form.stir.trim()) next.stir = "Укажите STIR / ИНН";
    }
    if (current === 2) {
      if (!form.owner_email.trim() && !form.owner_phone.trim()) {
        next.owner = "Нужен email или телефон владельца";
      }
      if (!isEdit && (!form.owner_password || form.owner_password.length < 8)) {
        next.owner_password = "Пароль не короче 8 символов";
      }
      if (isEdit && form.owner_password && form.owner_password.length < 8) {
        next.owner_password = "Пароль не короче 8 символов";
      }
      if (!form.owner_first_name.trim()) next.owner_first_name = "Укажите имя";
    }
    if (current === 3) {
      if (!form.includes_crm && !form.includes_app) {
        next.products = "Выберите CRM и/или приложение";
      }
    }
    if (current === 4) {
      if (!form.contract_number.trim()) next.contract_number = "Укажите номер договора";
      if (!form.contract_signed_on) next.contract_signed_on = "Укажите дату подписания";
      if (!hasContractFile(existingDocs, deleteDocIds, files.contract_file)) {
        next.contract_file = isEdit
          ? "Прикрепите новый договор или оставьте существующий файл"
          : "Прикрепите файл договора";
      }
    }
    return next;
  }

  function goNext() {
    const issues = validateStep(step);
    if (Object.keys(issues).length) {
      setError(Object.values(issues)[0]);
      return;
    }
    setError("");
    setStep((value) => Math.min(4, value + 1));
  }

  function goBack() {
    setError("");
    setStep((value) => Math.max(1, value - 1));
  }

  function jumpToStep(target) {
    if (target === step) return;
    if (target < step) {
      setError("");
      setStep(target);
      return;
    }
    for (let current = step; current < target; current += 1) {
      const issues = validateStep(current);
      if (Object.keys(issues).length) {
        setError(Object.values(issues)[0]);
        setStep(current);
        return;
      }
    }
    setError("");
    setStep(target);
  }

  function resetWizard() {
    setForm(emptyForm);
    setFiles(emptyFiles);
    setStep(1);
    setOpenWizard(false);
    setWizardMode("create");
    setEditingId(null);
    setExistingDocs([]);
    setDeleteDocIds([]);
  }

  function openCreateWizard() {
    setSelected(null);
    setForm(emptyForm);
    setFiles(emptyFiles);
    setStep(1);
    setWizardMode("create");
    setEditingId(null);
    setExistingDocs([]);
    setDeleteDocIds([]);
    setOpenWizard(true);
  }

  async function openEditWizard(row) {
    setError("");
    setInfo("");
    try {
      const full = await getPlatformTenant(row.id);
      setForm(tenantToForm(full));
      setFiles(emptyFiles);
      setStep(1);
      setWizardMode("edit");
      setEditingId(full.id);
      setExistingDocs(full.documents || []);
      setDeleteDocIds([]);
      setSelected(null);
      setOpenWizard(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function markDocDeleted(docId) {
    setDeleteDocIds((prev) => (prev.includes(docId) ? prev : [...prev, docId]));
  }

  function unmarkDocDeleted(docId) {
    setDeleteDocIds((prev) => prev.filter((id) => id !== docId));
  }

  async function removeDocument(docId) {
    if (!selected) return;
    setError("");
    try {
      const updated = await updatePlatformTenant(selected.id, {
        delete_document_ids: [docId],
      });
      setSelected(updated);
      setExistingDocs(updated.documents || []);
      await load();
      setInfo("Документ удалён.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDetails(row) {
    setError("");
    setSelected(row);
    setDetailLoading(true);
    try {
      const full = await getPlatformTenant(row.id);
      setSelected(full);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function buildPayload() {
    const payload = new FormData();
    const fields = {
      ...form,
      monthly_price: form.monthly_price || "0",
      licensed_until: form.licensed_until || "",
      includes_crm: String(form.includes_crm),
      includes_app: String(form.includes_app),
    };
    Object.entries(fields).forEach(([key, value]) => {
      if (key === "owner_password" && !value) return;
      if (value !== "" && value != null) payload.append(key, value);
    });
    Object.entries(files).forEach(([key, file]) => {
      if (file) payload.append(key, file);
    });
    if (deleteDocIds.length) {
      payload.append("delete_document_ids", JSON.stringify(deleteDocIds));
    }
    return payload;
  }

  async function create(event) {
    event.preventDefault();
    const issues = validateStep(4, "create");
    if (Object.keys(issues).length) {
      setError(Object.values(issues)[0]);
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const created = await createPlatformTenant(buildPayload());
      const login = created.owner?.email || created.owner?.phone || "";
      setInfo(
        created.owner_password
          ? `Клиент «${created.name}» подключён. Owner: ${login} / ${created.owner_password}`
          : `Клиент «${created.name}» подключён. Договор ${created.contract_number || ""} закреплён.`,
      );
      resetWizard();
      await load();
      setSelected(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    const issues = validateStep(4, "edit");
    if (Object.keys(issues).length) {
      setError(Object.values(issues)[0]);
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const updated = await updatePlatformTenant(editingId, buildPayload());
      setInfo(`Изменения по «${updated.name}» сохранены.`);
      resetWizard();
      await load();
      setSelected(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    setError("");
    try {
      await patchPlatformTenant(row.id, { is_active: !row.is_active });
      await load();
      if (selected?.id === row.id) {
        const full = await getPlatformTenant(row.id);
        setSelected(full);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function extendLicense(row) {
    setError("");
    try {
      await patchPlatformTenant(row.id, {
        licensed_until: addDays(row.licensed_until, 30),
        is_active: true,
      });
      await load();
      if (selected?.id === row.id) {
        const full = await getPlatformTenant(row.id);
        setSelected(full);
      }
      if (tariffTarget?.id === row.id) {
        const full = await getPlatformTenant(row.id);
        setTariffTarget(full);
        setTariff(tenantToTariff(full));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function openTariff(row) {
    setError("");
    setSelected(null);
    setTariffTarget(row);
    setTariff(tenantToTariff(row));
  }

  function closeTariff() {
    setTariffTarget(null);
    setTariff(emptyTariff);
  }

  function setTariffField(key, value) {
    setTariff((prev) => ({ ...prev, [key]: value }));
  }

  async function saveTariff(event) {
    event.preventDefault();
    if (!tariffTarget) return;
    if (!tariff.includes_crm && !tariff.includes_app) {
      setError("Выберите CRM и/или приложение");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const updated = await patchPlatformTenant(tariffTarget.id, {
        plan: tariff.plan,
        billing_cycle: tariff.billing_cycle,
        monthly_price: tariff.monthly_price || "0",
        licensed_until: tariff.licensed_until || null,
        includes_crm: tariff.includes_crm,
        includes_app: tariff.includes_app,
        is_active: true,
      });
      setInfo(`Тариф «${updated.name}» обновлён: ${PLAN_LABELS[updated.plan] || updated.plan}.`);
      closeTariff();
      await load();
      setSelected(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
    try {
      const updated = await patchPlatformTenant(row.id, {
        includes_crm: nextCrm,
        includes_app: nextApp,
      });
      await load();
      if (selected?.id === row.id) setSelected(updated);
      if (tariffTarget?.id === row.id) {
        setTariffTarget(updated);
        setTariff(tenantToTariff(updated));
      }
      setInfo(`«${row.name}»: ${productsOf(updated)}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function openCenter(row) {
    enterEducationCenter(row.id, row.slug);
    navigate(educationHomePath(row.slug));
  }

  const planChoices = useMemo(() => planOptionsFromCatalog(plans), [plans]);
  const paid = tenants.filter((row) => row.license_status === "active").length;
  const expired = tenants.filter((row) => row.license_status === "expired").length;
  const trial = tenants.filter((row) => row.license_status === "trial").length;
  const suspended = tenants.filter((row) => row.license_status === "suspended").length;
  const withCrm = tenants.filter((row) => row.includes_crm).length;
  const withApp = tenants.filter((row) => row.includes_app).length;
  const fullPack = tenants.filter((row) => row.includes_crm && row.includes_app).length;
  const planCounts = useMemo(() => {
    const counts = { trial: 0, start: 0, business: 0 };
    tenants.forEach((row) => {
      if (counts[row.plan] != null) counts[row.plan] += 1;
      else counts[row.plan] = 1;
    });
    return counts;
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((row) => {
      if (statusFilter !== "all" && row.license_status !== statusFilter) return false;
      if (planFilter !== "all" && row.plan !== planFilter) return false;
      if (productFilter === "crm" && !row.includes_crm) return false;
      if (productFilter === "app" && !row.includes_app) return false;
      if (productFilter === "full" && !(row.includes_crm && row.includes_app)) return false;
      if (productFilter === "crm_only" && !(row.includes_crm && !row.includes_app)) return false;
      if (productFilter === "app_only" && !(row.includes_app && !row.includes_crm)) return false;
      if (!q) return true;
      const haystack = [
        row.name,
        row.slug,
        row.city,
        row.contract_number,
        row.legal_name,
        row.stir,
        row.plan,
        row.owner?.email,
        row.owner?.phone,
        row.owner?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tenants, query, statusFilter, productFilter, planFilter]);

  return (
    <div>
      <PageHeader
        eyebrow="Платформа"
        title="Учебные центры"
        subtitle="Клиенты, тарифные планы и подключённые продукты (CRM / приложение)."
        actions={
          <div className="actions">
            <Link className="btn secondary" to="/super/plans">
              Тарифы
            </Link>
            <Link className="btn secondary" to="/super">
              Обзор
            </Link>
            <Button type="button" onClick={openCreateWizard}>
              Подключить центр
            </Button>
          </div>
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <section className="section-block">
        <div className="section-head">
          <h3>Сводка</h3>
        </div>
        <div className="grid cols-4">
          <button type="button" className="stat-hit" onClick={() => setStatusFilter("all")}>
            <StatCard label="Клиенты" value={tenants.length} hint="Все центры" />
          </button>
          <button type="button" className="stat-hit" onClick={() => setStatusFilter("active")}>
            <StatCard label="Оплачено" value={paid} hint="Фильтр: оплачен" />
          </button>
          <button type="button" className="stat-hit" onClick={() => setStatusFilter("expired")}>
            <StatCard label="Истекло" value={expired} hint="Фильтр: истекло" />
          </button>
          <button type="button" className="stat-hit" onClick={() => setStatusFilter("trial")}>
            <StatCard label="Пробный" value={trial} hint={`Отключено: ${suspended}`} />
          </button>
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h3>Тарифные планы</h3>
          <Link className="text-action" to="/super/plans">
            Создать / изменить тарифы
          </Link>
        </div>
        <div className="plan-board">
          {planChoices.map((plan) => (
            <button
              key={plan.value}
              type="button"
              className={`plan-card${planFilter === plan.value ? " is-active" : ""}`}
              onClick={() => setPlanFilter(planFilter === plan.value ? "all" : plan.value)}
            >
              <span className="plan-card-label">{plan.label}</span>
              <strong>{planCounts[plan.value] || 0}</strong>
              <span className="muted">{plan.hint}</span>
            </button>
          ))}
          <button
            type="button"
            className={`plan-card${productFilter === "full" ? " is-active" : ""}`}
            onClick={() => setProductFilter(productFilter === "full" ? "all" : "full")}
          >
            <span className="plan-card-label">Полный пакет</span>
            <strong>{fullPack}</strong>
            <span className="muted">CRM + приложение</span>
          </button>
        </div>
        <div className="product-summary">
          <button
            type="button"
            className={`product-chip is-btn${productFilter === "crm" ? " is-on" : ""}`}
            onClick={() => setProductFilter(productFilter === "crm" ? "all" : "crm")}
          >
            CRM · {withCrm}
          </button>
          <button
            type="button"
            className={`product-chip is-btn${productFilter === "app" ? " is-on" : ""}`}
            onClick={() => setProductFilter(productFilter === "app" ? "all" : "app")}
          >
            Приложение · {withApp}
          </button>
        </div>
      </section>

      <FiltersBar>
        <div className="grid cols-4" style={{ gap: 10, alignItems: "end" }}>
          <Field label="Поиск">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, город, договор, email…"
            />
          </Field>
          <Field label="Лицензия">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="active">Оплачен</option>
              <option value="trial">Пробный</option>
              <option value="expired">Истекло</option>
              <option value="suspended">Отключён</option>
            </select>
          </Field>
          <Field label="Тарифный план">
            <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              <option value="all">Все тарифы</option>
              {planChoices.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Подключено">
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              <option value="all">Все продукты</option>
              <option value="full">CRM + приложение</option>
              <option value="crm">Есть CRM</option>
              <option value="app">Есть приложение</option>
              <option value="crm_only">Только CRM</option>
              <option value="app_only">Только приложение</option>
            </select>
          </Field>
        </div>
        {(query || statusFilter !== "all" || productFilter !== "all" || planFilter !== "all") && (
          <div className="filters-actions" style={{ marginTop: 10 }}>
            <TextAction
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setProductFilter("all");
                setPlanFilter("all");
              }}
            >
              Сбросить фильтры
            </TextAction>
          </div>
        )}
      </FiltersBar>

      <section className="card">
        <div className="section-head">
          <h3>Клиенты</h3>
          <span className="muted">
            {filtered.length === tenants.length
              ? `${tenants.length} центров`
              : `${filtered.length} из ${tenants.length}`}
          </span>
        </div>
        <DataTable
          rows={filtered}
          empty={
            tenants.length
              ? "Ничего не найдено — сбросьте фильтр или поиск"
              : "Клиентов пока нет — нажмите «Подключить центр»"
          }
          onRowClick={openDetails}
          columns={[
            {
              key: "name",
              title: "Центр",
              render: (row) => (
                <div className="center-cell">
                  <strong>{row.name}</strong>
                  <span>
                    {[row.city, row.slug ? `/${row.slug}` : ""].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
              ),
            },
            {
              key: "plan",
              title: "Тариф",
              render: (row) => (
                <div className="center-cell">
                  <strong>{PLAN_LABELS[row.plan] || row.plan}</strong>
                  <span>
                    {CYCLE_LABELS[row.billing_cycle] || row.billing_cycle} ·{" "}
                    {money(row.monthly_price, row.currency || "UZS")}
                  </span>
                </div>
              ),
            },
            {
              key: "products",
              title: "Подключено",
              render: (row) => <ProductChips row={row} />,
            },
            {
              key: "licensed_until",
              title: "Оплачено до",
              render: (row) => formatDate(row.licensed_until),
            },
            { key: "student_count", title: "Ученики" },
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
              stopRowClick: true,
              render: (row) => (
                <div className="table-actions">
                  <Button
                    type="button"
                    className="secondary compact"
                    onClick={() => openTariff(row)}
                  >
                    Тариф
                  </Button>
                  <Button
                    type="button"
                    className="secondary compact"
                    onClick={() => openDetails(row)}
                  >
                    Карточка
                  </Button>
                  <Button type="button" className="compact" onClick={() => openCenter(row)}>
                    Кабинет
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>

      {openWizard ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Подключение центра">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={resetWizard} />
          <form
            className="sheet sheet-wide"
            onSubmit={wizardMode === "edit" ? saveEdit : create}
          >
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">{wizardMode === "edit" ? "Редактирование" : "Онбординг"}</div>
                <h2>{wizardMode === "edit" ? "Изменить учебный центр" : "Подключить учебный центр"}</h2>
                <p className="muted">
                  {wizardMode === "edit"
                    ? "Обновите данные центра, владельца, лицензию и документы."
                    : "Отдельная форма: юр. данные, владелец, лицензия и договор."}
                </p>
              </div>
              <button type="button" className="sheet-close" onClick={resetWizard} aria-label="Закрыть">
                ×
              </button>
            </div>

            <ol className="wizard-steps">
              {STEPS.map((item) => (
                <li
                  key={item.id}
                  className={`wizard-step${step === item.id ? " is-active" : ""}${
                    step > item.id ? " is-done" : ""
                  }`}
                >
                  <button type="button" className="wizard-step-btn" onClick={() => jumpToStep(item.id)}>
                    <span className="wizard-step-index">{item.id}</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="sheet-body">
              {step === 1 ? (
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <Field label="Название центра *">
                    <input value={form.name} onChange={(e) => setField("name", e.target.value)} />
                  </Field>
                  <Field label="Slug (URL)">
                    <input value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="inha" />
                  </Field>
                  <Field label="Юридическое название *">
                    <input value={form.legal_name} onChange={(e) => setField("legal_name", e.target.value)} />
                  </Field>
                  <Field label="STIR / ИНН *">
                    <input value={form.stir} onChange={(e) => setField("stir", e.target.value)} />
                  </Field>
                  <Field label="Город">
                    <input value={form.city} onChange={(e) => setField("city", e.target.value)} />
                  </Field>
                  <Field label="Телефон центра">
                    <input
                      value={form.contact_phone}
                      onChange={(e) => setPhoneField("contact_phone", e.target.value)}
                      placeholder="+998 99 999 99 99"
                    />
                  </Field>
                  <Field label="Юридический адрес">
                    <input value={form.legal_address} onChange={(e) => setField("legal_address", e.target.value)} />
                  </Field>
                  <Field label="Директор">
                    <input value={form.director_name} onChange={(e) => setField("director_name", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <Field label="Имя владельца *">
                    <input
                      value={form.owner_first_name}
                      onChange={(e) => setField("owner_first_name", e.target.value)}
                    />
                  </Field>
                  <Field label="Фамилия владельца">
                    <input
                      value={form.owner_last_name}
                      onChange={(e) => setField("owner_last_name", e.target.value)}
                    />
                  </Field>
                  <Field label="Email владельца">
                    <input
                      type="email"
                      value={form.owner_email}
                      onChange={(e) => setField("owner_email", e.target.value)}
                    />
                  </Field>
                  <Field label="Телефон владельца">
                    <input
                      value={form.owner_phone}
                      onChange={(e) => setPhoneField("owner_phone", e.target.value)}
                      placeholder="+998 99 999 99 99"
                    />
                  </Field>
                  <Field label={wizardMode === "edit" ? "Пароль владельца (новый)" : "Пароль владельца *"}>
                    <input
                      type="text"
                      value={form.owner_password}
                      onChange={(e) => setField("owner_password", e.target.value)}
                      minLength={wizardMode === "edit" ? undefined : 8}
                      autoComplete="new-password"
                      placeholder={wizardMode === "edit" ? "Оставьте пустым, если не меняете" : ""}
                    />
                  </Field>
                </div>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="grid cols-2" style={{ gap: 12 }}>
                    <Field label="Тариф">
                      <select value={form.plan} onChange={(e) => setField("plan", e.target.value)}>
                        {planChoices.map((plan) => (
                          <option key={plan.value} value={plan.value}>
                            {plan.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Оплата">
                      <select
                        value={form.billing_cycle}
                        onChange={(e) => setField("billing_cycle", e.target.value)}
                      >
                        <option value="monthly">Ежемесячно</option>
                        <option value="yearly">Ежегодно</option>
                      </select>
                    </Field>
                    <Field label="Цена в месяц, UZS">
                      <input
                        value={form.monthly_price}
                        onChange={(e) => setField("monthly_price", e.target.value)}
                      />
                    </Field>
                    <Field label="Оплачено до">
                      <input
                        type="date"
                        value={form.licensed_until}
                        onChange={(e) => setField("licensed_until", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="product-picks">
                    <label className={`product-pick${form.includes_crm ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={form.includes_crm}
                        onChange={(e) => setField("includes_crm", e.target.checked)}
                      />
                      <strong>CRM</strong>
                      <span>Лиды, воронка, продажи</span>
                    </label>
                    <label className={`product-pick${form.includes_app ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={form.includes_app}
                        onChange={(e) => setField("includes_app", e.target.checked)}
                      />
                      <strong>Приложение</strong>
                      <span>Кабинет ученика и расписание</span>
                    </label>
                  </div>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <div className="grid cols-2" style={{ gap: 12 }}>
                    <Field label="Номер договора *">
                      <input
                        value={form.contract_number}
                        onChange={(e) => setField("contract_number", e.target.value)}
                        placeholder="YG-2026-014"
                      />
                    </Field>
                    <Field label="Дата подписания *">
                      <input
                        type="date"
                        value={form.contract_signed_on}
                        onChange={(e) => setField("contract_signed_on", e.target.value)}
                      />
                    </Field>
                    <Field label="Комментарий">
                      <input value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
                    </Field>
                  </div>

                  {wizardMode === "edit" && existingDocs.length ? (
                    <section className="detail-section" style={{ marginTop: 16 }}>
                      <h3>Текущие документы</h3>
                      <ul className="doc-list">
                        {existingDocs.map((doc) => {
                          const marked = deleteDocIds.includes(doc.id);
                          return (
                            <li key={doc.id} className={marked ? "is-muted" : ""}>
                              <div>
                                <strong>{DOC_KIND_LABELS[doc.kind] || doc.kind}</strong>
                                <span>{doc.original_name || doc.title || "файл"}</span>
                              </div>
                              <div className="row" style={{ gap: 8 }}>
                                {!marked ? (
                                  <a
                                    className="text-action inline"
                                    href={mediaUrl(doc.file)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Открыть
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  className="text-action inline"
                                  onClick={() =>
                                    marked ? unmarkDocDeleted(doc.id) : markDocDeleted(doc.id)
                                  }
                                >
                                  {marked ? "Вернуть" : "Удалить"}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}

                  <div className="file-grid">
                    <FileDrop
                      label={wizardMode === "edit" ? "Новый договор" : "Договор *"}
                      hint={
                        wizardMode === "edit"
                          ? "Загрузите, чтобы заменить текущий договор"
                          : "PDF / DOC — обязательный файл"
                      }
                      file={files.contract_file}
                      onChange={(file) => setFiles((prev) => ({ ...prev, contract_file: file }))}
                    />
                    <FileDrop
                      label="Лицензия центра"
                      hint="Скан лицензии или сертификата"
                      file={files.license_file}
                      onChange={(file) => setFiles((prev) => ({ ...prev, license_file: file }))}
                    />
                    <FileDrop
                      label="Паспорт / доверенность"
                      hint="Документ директора или представителя"
                      file={files.passport_file}
                      onChange={(file) => setFiles((prev) => ({ ...prev, passport_file: file }))}
                    />
                    <FileDrop
                      label="Доп. документ"
                      hint="Приложение к договору и т.п."
                      file={files.other_file}
                      onChange={(file) => setFiles((prev) => ({ ...prev, other_file: file }))}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div className="wizard-actions sheet-foot">
              {step > 1 ? (
                <Button type="button" className="secondary" onClick={goBack}>
                  Назад
                </Button>
              ) : (
                <Button type="button" className="secondary" onClick={resetWizard}>
                  Отмена
                </Button>
              )}
              {step < 4 ? (
                <Button type="button" onClick={goNext}>
                  Далее
                </Button>
              ) : (
                <Button type="submit" busy={busy}>
                  {wizardMode === "edit" ? "Сохранить изменения" : "Подключить и закрепить договор"}
                </Button>
              )}
            </div>
          </form>
        </div>
      ) : null}

      {tariffTarget ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Тариф центра">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={closeTariff} />
          <form className="sheet" onSubmit={saveTariff}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Тарифный план</div>
                <h2>{tariffTarget.name}</h2>
                <p className="muted">План, цикл оплаты и подключённые продукты.</p>
              </div>
              <button type="button" className="sheet-close" onClick={closeTariff} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="plan-pick-grid">
                {planChoices.map((plan) => (
                  <button
                    key={plan.value}
                    type="button"
                    className={`plan-pick${tariff.plan === plan.value ? " is-on" : ""}`}
                    onClick={() => {
                      setTariffField("plan", plan.value);
                      const catalog = plans.find((item) => item.code === plan.value);
                      if (catalog) {
                        setTariff((prev) => ({
                          ...prev,
                          plan: plan.value,
                          monthly_price: String(catalog.default_monthly_price ?? prev.monthly_price),
                          billing_cycle: catalog.default_billing_cycle || prev.billing_cycle,
                          includes_crm: catalog.includes_crm,
                          includes_app: catalog.includes_app,
                        }));
                      }
                    }}
                  >
                    <strong>{plan.label}</strong>
                    <span>{plan.hint}</span>
                  </button>
                ))}
              </div>

              <div className="grid cols-2" style={{ gap: 12, marginTop: 14 }}>
                <Field label="Оплата">
                  <select
                    value={tariff.billing_cycle}
                    onChange={(event) => setTariffField("billing_cycle", event.target.value)}
                  >
                    <option value="monthly">Ежемесячно</option>
                    <option value="yearly">Ежегодно</option>
                  </select>
                </Field>
                <Field label="Цена / мес, UZS">
                  <input
                    value={tariff.monthly_price}
                    onChange={(event) => setTariffField("monthly_price", event.target.value)}
                  />
                </Field>
                <Field label="Оплачено до">
                  <input
                    type="date"
                    value={tariff.licensed_until}
                    onChange={(event) => setTariffField("licensed_until", event.target.value)}
                  />
                </Field>
              </div>

              <div className="product-picks" style={{ marginTop: 14 }}>
                <label className={`product-pick${tariff.includes_crm ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={tariff.includes_crm}
                    onChange={(event) => setTariffField("includes_crm", event.target.checked)}
                  />
                  <strong>CRM</strong>
                  <span>Лиды, воронка, продажи</span>
                </label>
                <label className={`product-pick${tariff.includes_app ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={tariff.includes_app}
                    onChange={(event) => setTariffField("includes_app", event.target.checked)}
                  />
                  <strong>Приложение</strong>
                  <span>Кабинет ученика и расписание</span>
                </label>
              </div>
            </div>
            <div className="wizard-actions sheet-foot">
              <Button type="button" className="secondary" onClick={closeTariff}>
                Отмена
              </Button>
              <Button
                type="button"
                className="secondary"
                onClick={() => {
                  setTariffField("licensed_until", addDays(tariff.licensed_until, 30));
                }}
              >
                +30 дней
              </Button>
              <Button type="submit" busy={busy}>
                Сохранить тариф
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Детали центра">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setSelected(null)}
          />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Карточка клиента</div>
                <h2>{selected.name}</h2>
                <p className="muted">
                  /education/{selected.slug}
                  {detailLoading ? " · обновление..." : ""}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setSelected(null)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="sheet-body">
              <div className="detail-badges">
                <Badge
                  value={selected.license_status}
                  label={LICENSE_LABELS[selected.license_status] || selected.license_status}
                />
                <ProductChips row={selected} />
              </div>

              <div className="detail-quick">
                <div>
                  <span>Тариф</span>
                  <strong>
                    {PLAN_LABELS[selected.plan] || selected.plan} /{" "}
                    {CYCLE_LABELS[selected.billing_cycle] || selected.billing_cycle}
                  </strong>
                </div>
                <div>
                  <span>Владелец</span>
                  <strong>{selected.owner?.name || selected.owner?.email || "—"}</strong>
                </div>
                <div>
                  <span>Оплачено до</span>
                  <strong>{formatDate(selected.licensed_until)}</strong>
                </div>
              </div>

              <section className="detail-section">
                <h3>Подключённые продукты</h3>
                <div className="product-picks">
                  <button
                    type="button"
                    className={`product-pick${selected.includes_crm ? " is-on" : ""}`}
                    onClick={() => toggleProduct(selected, "includes_crm")}
                  >
                    <strong>CRM</strong>
                    <span>{selected.includes_crm ? "Подключено · нажмите, чтобы отключить" : "Отключено · нажмите, чтобы включить"}</span>
                  </button>
                  <button
                    type="button"
                    className={`product-pick${selected.includes_app ? " is-on" : ""}`}
                    onClick={() => toggleProduct(selected, "includes_app")}
                  >
                    <strong>Приложение</strong>
                    <span>{selected.includes_app ? "Подключено · нажмите, чтобы отключить" : "Отключено · нажмите, чтобы включить"}</span>
                  </button>
                </div>
                <div className="row" style={{ gap: 10, marginTop: 12 }}>
                  <Button type="button" className="secondary compact" onClick={() => openTariff(selected)}>
                    Изменить тариф
                  </Button>
                  <Button type="button" className="secondary compact" onClick={() => extendLicense(selected)}>
                    +30 дней
                  </Button>
                </div>
              </section>

              <section className="detail-section">
                <h3>Центр</h3>
                <dl className="detail-list">
                  <DetailRow label="Юр. название">{selected.legal_name}</DetailRow>
                  <DetailRow label="STIR / ИНН">{selected.stir}</DetailRow>
                  <DetailRow label="Город">{selected.city}</DetailRow>
                  <DetailRow label="Адрес">{selected.legal_address}</DetailRow>
                  <DetailRow label="Телефон">{selected.contact_phone}</DetailRow>
                  <DetailRow label="Директор">{selected.director_name}</DetailRow>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Владелец</h3>
                <dl className="detail-list">
                  <DetailRow label="Имя">{selected.owner?.name}</DetailRow>
                  <DetailRow label="Email">{selected.owner?.email}</DetailRow>
                  <DetailRow label="Телефон">{selected.owner?.phone}</DetailRow>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Лицензия</h3>
                <dl className="detail-list">
                  <DetailRow label="Тариф">
                    {PLAN_LABELS[selected.plan] || selected.plan} /{" "}
                    {CYCLE_LABELS[selected.billing_cycle] || selected.billing_cycle}
                  </DetailRow>
                  <DetailRow label="Цена / мес">
                    {selected.monthly_price
                      ? money(selected.monthly_price, selected.currency || "UZS")
                      : "—"}
                  </DetailRow>
                  <DetailRow label="С">{formatDate(selected.licensed_from)}</DetailRow>
                  <DetailRow label="До">{formatDate(selected.licensed_until)}</DetailRow>
                  <DetailRow label="Ученики">{selected.student_count ?? "—"}</DetailRow>
                  <DetailRow label="Сотрудники">{selected.staff_count ?? "—"}</DetailRow>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Договор</h3>
                <dl className="detail-list">
                  <DetailRow label="Номер">{selected.contract_number}</DetailRow>
                  <DetailRow label="Подписан">{formatDate(selected.contract_signed_on)}</DetailRow>
                  <DetailRow label="Заметки">{selected.notes}</DetailRow>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Документы</h3>
                {(selected.documents || []).length ? (
                  <ul className="doc-list">
                    {selected.documents.map((doc) => (
                      <li key={doc.id}>
                        <div>
                          <strong>{DOC_KIND_LABELS[doc.kind] || doc.kind}</strong>
                          <span>{doc.original_name || doc.title || "файл"}</span>
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <a
                            className="text-action inline"
                            href={mediaUrl(doc.file)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Открыть
                          </a>
                          <button
                            type="button"
                            className="text-action inline"
                            onClick={() => removeDocument(doc.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Документов пока нет</p>
                )}
              </section>
            </div>

            <div className="sheet-foot detail-foot">
              <div className="detail-foot-main">
                <Button type="button" onClick={() => openTariff(selected)}>
                  Тариф
                </Button>
                <Button type="button" onClick={() => openEditWizard(selected)}>
                  Редактировать
                </Button>
                <Button type="button" onClick={() => openCenter(selected)}>
                  Открыть кабинет
                </Button>
              </div>
              <div className="detail-foot-side">
                <Button type="button" className="secondary" onClick={() => extendLicense(selected)}>
                  +30 дней
                </Button>
                <Button type="button" className="secondary" onClick={() => toggleActive(selected)}>
                  {selected.is_active ? "Отключить" : "Включить"}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
