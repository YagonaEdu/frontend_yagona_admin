import { lazy, Suspense } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Field, PageHeader } from "@/components/ui";
import PageFallback from "@/components/layout/PageFallback";
import { CYCLE_LABELS, LICENSE_LABELS, ROLE_LABELS } from "@/constants";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatDate, money } from "@/utils/format";
import { isAdminRole } from "@/utils/roleAccess";

const AdminSettingsPage = lazy(() => import("./resepshen_yagona/AdminSettingsPage"));

const ALL_SECTIONS = [
  { id: "plan", label: "Тариф Yagona" },
  { id: "documents", label: "Договор и документы" },
  { id: "general", label: "Общие" },
  { id: "branding", label: "Брендинг" },
  { id: "contacts", label: "Контакты" },
  { id: "education", label: "Учебный процесс" },
  { id: "finance", label: "Финансы" },
  { id: "notifications", label: "Уведомления" },
  { id: "roles", label: "Пользователи и роли" },
  { id: "integrations", label: "Интеграции" },
  { id: "security", label: "Безопасность" },
];

const PLAN_STATUS_LABELS = {
  ...LICENSE_LABELS,
  expiring_soon: "Истекает скоро",
  active: "Активен",
  trial: "Пробный",
  expired: "Просрочен",
  suspended: "Приостановлен",
};

const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

const NOTIF_CATEGORIES = [
  ["payment", "Платежи"],
  ["debt", "Задолженности"],
  ["attendance", "Посещаемость"],
  ["schedule", "Расписание"],
  ["crm", "CRM"],
  ["students", "Ученики"],
  ["staff", "Сотрудники"],
  ["system", "Системные"],
];

const ROLE_CAPS = [
  ["can_manage_students", "Ученики"],
  ["can_manage_crm", "CRM"],
  ["can_manage_billing", "Биллинг"],
  ["can_edit_attendance", "Посещаемость"],
  ["can_send_notifications", "Уведомления"],
  ["can_manage_staff", "Команда"],
  ["can_manage_settings", "Настройки"],
];

const EMPTY_SETTINGS = {
  education: {
    default_lesson_duration_minutes: 90,
    default_group_capacity: 12,
    working_days: [1, 2, 3, 4, 5, 6],
    working_hours_start: "09:00",
    working_hours_end: "21:00",
  },
  finance: {
    payment_due_day: 10,
    grace_period_days: 5,
    debt_warning_threshold: 0,
    default_payment_method: "cash",
    payment_reminder_days: 3,
  },
  notifications: {
    payment: true,
    debt: true,
    attendance: true,
    schedule: true,
    crm: true,
    students: true,
    staff: true,
    system: true,
    channel_in_app: true,
    channel_push: true,
    channel_email: false,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default function SettingsPage() {
  const session = getSession();
  const membership = currentMembership(session);
  if (isAdminRole(membership?.role)) {
    return (
      <Suspense fallback={<PageFallback label="Загрузка настроек…" />}>
        <AdminSettingsPage />
      </Suspense>
    );
  }
  return <OwnerSettingsPage />;
}

function OwnerSettingsPage() {
  const session = getSession();
  const membership = currentMembership(session);
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const SECTIONS = ALL_SECTIONS;

  const [section, setSection] = useState("plan");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api.get("/tenant/settings");
      setData(payload);
      setForm({
        name: payload.name || "",
        short_name: payload.short_name || "",
        description: payload.description || "",
        language: payload.language || "ru",
        timezone: payload.timezone || "Asia/Tashkent",
        currency: payload.currency || "UZS",
        primary_color: payload.primary_color || "#2563eb",
        secondary_color: payload.secondary_color || "#0d9488",
        contact_phone: payload.contact_phone || "",
        contact_phone_secondary: payload.contact_phone_secondary || "",
        contact_email: payload.contact_email || "",
        telegram: payload.telegram || "",
        website: payload.website || "",
        legal_name: payload.legal_name || "",
        legal_address: payload.legal_address || "",
        city: payload.city || "",
        stir: payload.stir || "",
        director_name: payload.director_name || "",
        contract_number: payload.contract_number || "",
        contract_signed_on: payload.contract_signed_on || "",
        center_settings: clone(payload.center_settings || EMPTY_SETTINGS),
      });
      setLogoFile(null);
    } catch (err) {
      setError(err.message || "Не удалось загрузить настройки.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toast(message) {
    setInfo(message);
    window.setTimeout(() => setInfo(""), 3500);
  }

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function patchSettings(sectionKey, patch) {
    setForm((prev) => ({
      ...prev,
      center_settings: {
        ...prev.center_settings,
        [sectionKey]: {
          ...prev.center_settings[sectionKey],
          ...patch,
        },
      },
    }));
  }

  async function saveSection(keys, settingsSection) {
    if (!canEdit || !form) return;
    setSaving(true);
    setError("");
    try {
      let payload;
      if (section === "branding" && logoFile) {
        payload = new FormData();
        keys.forEach((key) => {
          if (form[key] != null) payload.append(key, form[key]);
        });
        payload.append("logo", logoFile);
      } else if (settingsSection) {
        payload = {
          center_settings: {
            [settingsSection]: form.center_settings[settingsSection],
          },
        };
      } else {
        payload = {};
        keys.forEach((key) => {
          payload[key] = form[key];
        });
      }
      const updated = await api.patch("/tenant/settings", payload);
      setData(updated);
      setForm((prev) => ({
        ...prev,
        name: updated.name || "",
        short_name: updated.short_name || "",
        description: updated.description || "",
        language: updated.language || "ru",
        timezone: updated.timezone || "Asia/Tashkent",
        currency: updated.currency || "UZS",
        primary_color: updated.primary_color || "#2563eb",
        secondary_color: updated.secondary_color || "#0d9488",
        contact_phone: updated.contact_phone || "",
        contact_phone_secondary: updated.contact_phone_secondary || "",
        contact_email: updated.contact_email || "",
        telegram: updated.telegram || "",
        website: updated.website || "",
        legal_name: updated.legal_name || "",
        legal_address: updated.legal_address || "",
        city: updated.city || "",
        stir: updated.stir || "",
        director_name: updated.director_name || "",
        contract_number: updated.contract_number || "",
        contract_signed_on: updated.contract_signed_on || "",
        center_settings: clone(updated.center_settings || EMPTY_SETTINGS),
      }));
      setLogoFile(null);
      toast("Изменения сохранены");
    } catch (err) {
      setError(err.message || "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm) {
      setError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/me/password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm: "" });
      toast("Пароль обновлён");
    } catch (err) {
      setError(err.message || "Не удалось сменить пароль.");
    } finally {
      setSaving(false);
    }
  }

  async function resetBranding() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.post("/tenant/settings/reset-branding", {});
      setData(updated);
      patchForm({
        primary_color: updated.primary_color || "#2563eb",
        secondary_color: updated.secondary_color || "#0d9488",
      });
      setLogoFile(null);
      setResetOpen(false);
      toast("Брендинг сброшен");
    } catch (err) {
      setError(err.message || "Не удалось сбросить брендинг.");
    } finally {
      setSaving(false);
    }
  }

  const previewName = form?.short_name || form?.name || "Учебный центр";
  const logoPreview = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    return data?.logo_url || null;
  }, [logoFile, data?.logo_url]);

  useEffect(() => {
    if (!logoFile || !logoPreview) return undefined;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoFile, logoPreview]);

  function SaveBar({ onSave }) {
    if (!canEdit) {
      return <p className="muted settings-readonly">Только просмотр. Изменения доступны владельцу и админу.</p>;
    }
    return (
      <div className="settings-save-bar">
        <Button type="button" disabled={saving} onClick={onSave}>
          {saving ? "Сохранение…" : "Сохранить изменения"}
        </Button>
      </div>
    );
  }

  function renderSection() {
    if (!form) return null;
    const edu = form.center_settings.education;
    const fin = form.center_settings.finance;
    const notif = form.center_settings.notifications;
    const sub = data?.subscription;
    const docs = data?.documents || [];

    if (section === "plan") {
      const cycleLabel =
        CYCLE_LABELS[sub?.billing_cycle] ||
        (sub?.billing_cycle === "monthly" ? "месяц" : sub?.billing_cycle === "yearly" ? "год" : sub?.billing_cycle);
      const statusClass = `settings-plan-status status-${sub?.status || "active"}`;
      return (
        <section className="settings-panel settings-plan-panel">
          <header className="settings-panel-head">
            <h2>Тариф Yagona</h2>
            <p className="muted">Подписка учебного центра на платформу Yagona</p>
          </header>

          {sub?.status === "expiring_soon" && sub?.days_left != null ? (
            <div className="settings-plan-banner is-warn">
              Срок лицензии истекает через {sub.days_left} дн. ({formatDate(sub.licensed_until)})
            </div>
          ) : null}
          {sub?.status === "expired" ? (
            <div className="settings-plan-banner is-danger">
              Лицензия просрочена{sub.licensed_until ? ` с ${formatDate(sub.licensed_until)}` : ""}.
              Свяжитесь с Yagona для продления.
            </div>
          ) : null}
          {sub?.status === "suspended" ? (
            <div className="settings-plan-banner is-danger">Центр приостановлен.</div>
          ) : null}

          <div className="settings-plan-card">
            <div className="settings-plan-card-top">
              <div>
                <p className="settings-plan-eyebrow">Текущий тариф</p>
                <h3>{sub?.plan_name || "—"}</h3>
                {sub?.plan_description ? <p className="muted">{sub.plan_description}</p> : null}
              </div>
              <span className={statusClass}>{PLAN_STATUS_LABELS[sub?.status] || sub?.status}</span>
            </div>
            <div className="settings-plan-price">
              <strong>{money(sub?.monthly_price, "UZS")}</strong>
              <span>/ {cycleLabel || "период"}</span>
            </div>
            <dl className="settings-plan-meta">
              <div>
                <dt>Начало</dt>
                <dd>{sub?.licensed_from ? formatDate(sub.licensed_from) : "—"}</dd>
              </div>
              <div>
                <dt>Следующий платёж / окончание</dt>
                <dd>{sub?.next_payment_date ? formatDate(sub.next_payment_date) : "—"}</dd>
              </div>
              <div>
                <dt>Окончание лицензии</dt>
                <dd>{sub?.licensed_until ? formatDate(sub.licensed_until) : "—"}</dd>
              </div>
              <div>
                <dt>Статус лицензии</dt>
                <dd>{PLAN_STATUS_LABELS[sub?.license_status] || sub?.license_status || "—"}</dd>
              </div>
            </dl>
            <div className="settings-plan-actions">
              <Button type="button" variant="secondary" onClick={() => setSection("documents")}>
                Посмотреть договор
              </Button>
              <a className="btn btn-primary" href="mailto:support@yagona.uz">
                Связаться с Yagona
              </a>
            </div>
          </div>

          <div className="settings-plan-grid">
            <div className="settings-plan-block">
              <h3>Использование</h3>
              <div className="settings-usage-list">
                <div className="settings-usage-row">
                  <div>
                    <strong>Ученики</strong>
                    <span className="muted">Активные</span>
                  </div>
                  <strong>{data?.usage?.students?.count ?? "—"}</strong>
                </div>
                <div className="settings-usage-row">
                  <div>
                    <strong>Сотрудники</strong>
                    <span className="muted">Без студентов</span>
                  </div>
                  <strong>{data?.usage?.staff?.count ?? "—"}</strong>
                </div>
              </div>
              <p className="muted settings-usage-note">
                Лимиты тарифа в системе не заданы — показаны фактические счётчики.
              </p>
            </div>
            <div className="settings-plan-block">
              <h3>Возможности тарифа</h3>
              <ul className="settings-feature-list">
                {(sub?.features || []).map((item) => (
                  <li key={item.key} className={item.included ? "is-on" : "is-off"}>
                    <span>{item.included ? "✓" : "—"}</span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="settings-plan-block">
            <h3>История оплаты Yagona</h3>
            <p className="muted">
              История платежей за подписку Yagona пока не хранится в API. Оплата учеников — в разделе
              «Биллинг».
            </p>
          </div>
        </section>
      );
    }

    if (section === "documents") {
      const contractDoc = docs.find((item) => item.kind === "contract");
      const daysLeft = sub?.days_left;
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Договор и документы</h2>
            <p className="muted">Договор с Yagona и загруженные документы центра</p>
          </header>

          {sub?.licensed_until ? (
            <div
              className={`settings-plan-banner${
                sub.status === "expired" || sub.status === "expiring_soon" ? " is-warn" : ""
              }`}
            >
              {sub.status === "expired"
                ? `Срок договора/лицензии истёк ${formatDate(sub.licensed_until)}`
                : daysLeft != null && daysLeft <= 14
                  ? `Срок договора истекает через ${daysLeft} дн. (${formatDate(sub.licensed_until)})`
                  : `Договор / лицензия действует до ${formatDate(sub.licensed_until)}`}
            </div>
          ) : null}

          <div className="settings-contract-summary">
            <div>
              <span className="muted">Номер договора</span>
              <strong>{form.contract_number || "—"}</strong>
            </div>
            <div>
              <span className="muted">Дата договора</span>
              <strong>{form.contract_signed_on ? formatDate(form.contract_signed_on) : "—"}</strong>
            </div>
            <div>
              <span className="muted">Юридическое лицо</span>
              <strong>{form.legal_name || "—"}</strong>
            </div>
            <div>
              <span className="muted">ИНН</span>
              <strong>{form.stir || "—"}</strong>
            </div>
            <div>
              <span className="muted">Ответственное лицо</span>
              <strong>{form.director_name || "—"}</strong>
            </div>
            <div>
              <span className="muted">Период лицензии</span>
              <strong>
                {sub?.licensed_from ? formatDate(sub.licensed_from) : "—"}
                {" — "}
                {sub?.licensed_until ? formatDate(sub.licensed_until) : "—"}
              </strong>
            </div>
          </div>

          <div className="settings-doc-actions">
            {contractDoc?.file_url ? (
              <a className="btn btn-primary" href={contractDoc.file_url} target="_blank" rel="noreferrer">
                Открыть / скачать договор
              </a>
            ) : (
              <p className="muted">Файл договора пока не загружен (загружает команда Yagona).</p>
            )}
          </div>

          <h3 className="settings-subhead">Документы</h3>
          {!docs.length ? (
            <p className="muted">Документы отсутствуют.</p>
          ) : (
            <div className="settings-doc-table-wrap">
              <table className="settings-doc-table">
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Тип</th>
                    <th>Дата</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.title}</td>
                      <td>{doc.kind_label}</td>
                      <td>{doc.created_at ? formatDate(doc.created_at) : "—"}</td>
                      <td>
                        {doc.file_url ? (
                          <a href={doc.file_url} target="_blank" rel="noreferrer">
                            Скачать
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canEdit ? (
            <>
              <h3 className="settings-subhead">Реквизиты договора (центр)</h3>
              <div className="settings-form-grid">
                <Field label="Номер договора">
                  <input
                    value={form.contract_number}
                    onChange={(e) => patchForm({ contract_number: e.target.value })}
                  />
                </Field>
                <Field label="Дата договора">
                  <input
                    type="date"
                    value={form.contract_signed_on || ""}
                    onChange={(e) => patchForm({ contract_signed_on: e.target.value })}
                  />
                </Field>
              </div>
              <SaveBar onSave={() => saveSection(["contract_number", "contract_signed_on"])} />
            </>
          ) : null}
        </section>
      );
    }

    if (section === "general") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Общие</h2>
            <p className="muted">Основные параметры учебного центра</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Название учебного центра">
              <input
                value={form.name}
                disabled={!canEdit}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </Field>
            <Field label="Короткое название">
              <input
                value={form.short_name}
                disabled={!canEdit}
                onChange={(e) => patchForm({ short_name: e.target.value })}
              />
            </Field>
            <div className="settings-span-2">
              <Field label="Описание">
                <textarea
                  rows={3}
                  value={form.description}
                  disabled={!canEdit}
                  onChange={(e) => patchForm({ description: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Язык интерфейса">
              <select
                value={form.language}
                disabled={!canEdit}
                onChange={(e) => patchForm({ language: e.target.value })}
              >
                <option value="ru">Русский</option>
                <option value="uz">Oʻzbekcha</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Часовой пояс">
              <select
                value={form.timezone}
                disabled={!canEdit}
                onChange={(e) => patchForm({ timezone: e.target.value })}
              >
                <option value="Asia/Tashkent">Asia/Tashkent</option>
                <option value="Asia/Samarkand">Asia/Samarkand</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <Field label="Валюта">
              <select
                value={form.currency}
                disabled={!canEdit}
                onChange={(e) => patchForm({ currency: e.target.value })}
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
          </div>

          <h3 className="settings-subhead">Юридическая информация</h3>
          <div className="settings-form-grid">
            <Field label="Юридическое название">
              <input
                value={form.legal_name}
                disabled={!canEdit}
                onChange={(e) => patchForm({ legal_name: e.target.value })}
              />
            </Field>
            <Field label="ИНН / STIR">
              <input
                value={form.stir}
                disabled={!canEdit}
                onChange={(e) => patchForm({ stir: e.target.value })}
              />
            </Field>
            <div className="settings-span-2">
              <Field label="Юридический адрес">
                <input
                  value={form.legal_address}
                  disabled={!canEdit}
                  onChange={(e) => patchForm({ legal_address: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Директор / ответственное лицо">
              <input
                value={form.director_name}
                disabled={!canEdit}
                onChange={(e) => patchForm({ director_name: e.target.value })}
              />
            </Field>
            <Field label="Город">
              <input
                value={form.city}
                disabled={!canEdit}
                onChange={(e) => patchForm({ city: e.target.value })}
              />
            </Field>
          </div>

          {data?.owner ? (
            <div className="settings-owner-card">
              <h3>Владелец учебного центра</h3>
              <dl>
                <div>
                  <dt>Имя</dt>
                  <dd>{data.owner.name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{data.owner.email || "—"}</dd>
                </div>
                <div>
                  <dt>Телефон</dt>
                  <dd>{data.owner.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Роль</dt>
                  <dd>{ROLE_LABELS[data.owner.role] || data.owner.role}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{data.owner.is_active ? "Активен" : "Неактивен"}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <SaveBar
            onSave={() =>
              saveSection([
                "name",
                "short_name",
                "description",
                "language",
                "timezone",
                "currency",
                "legal_name",
                "stir",
                "legal_address",
                "director_name",
                "city",
              ])
            }
          />
        </section>
      );
    }

    if (section === "branding") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Брендинг</h2>
            <p className="muted">Логотип и цвета центра</p>
          </header>
          <div className="settings-branding-layout">
            <div className="settings-form-grid">
              <div className="settings-span-2">
                <Field label="Логотип">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!canEdit}
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  />
                </Field>
              </div>
              <Field label="Основной цвет">
                <div className="settings-color-row">
                  <input
                    type="color"
                    value={form.primary_color || "#2563eb"}
                    disabled={!canEdit}
                    onChange={(e) => patchForm({ primary_color: e.target.value })}
                  />
                  <input
                    value={form.primary_color}
                    disabled={!canEdit}
                    onChange={(e) => patchForm({ primary_color: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Дополнительный цвет">
                <div className="settings-color-row">
                  <input
                    type="color"
                    value={form.secondary_color || "#0d9488"}
                    disabled={!canEdit}
                    onChange={(e) => patchForm({ secondary_color: e.target.value })}
                  />
                  <input
                    value={form.secondary_color}
                    disabled={!canEdit}
                    onChange={(e) => patchForm({ secondary_color: e.target.value })}
                  />
                </div>
              </Field>
            </div>
            <div
              className="settings-brand-preview"
              style={{
                "--preview-primary": form.primary_color || "#2563eb",
                "--preview-secondary": form.secondary_color || "#0d9488",
              }}
            >
              <div className="settings-brand-preview-bar">
                {logoPreview ? <img src={logoPreview} alt="" /> : <span className="settings-brand-mark">Y</span>}
                <strong>{previewName}</strong>
              </div>
              <p>Предпросмотр брендинга учебного центра</p>
              <button type="button" className="settings-brand-preview-cta">
                Пример кнопки
              </button>
            </div>
          </div>
          <SaveBar onSave={() => saveSection(["primary_color", "secondary_color"])} />
        </section>
      );
    }

    if (section === "contacts") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Контакты</h2>
            <p className="muted">Как с вами связываются ученики и родители</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Основной телефон">
              <input
                value={form.contact_phone}
                disabled={!canEdit}
                onChange={(e) => patchForm({ contact_phone: e.target.value })}
              />
            </Field>
            <Field label="Дополнительный телефон">
              <input
                value={form.contact_phone_secondary}
                disabled={!canEdit}
                onChange={(e) => patchForm({ contact_phone_secondary: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.contact_email}
                disabled={!canEdit}
                onChange={(e) => patchForm({ contact_email: e.target.value })}
              />
            </Field>
            <Field label="Telegram">
              <input
                placeholder="@username"
                value={form.telegram}
                disabled={!canEdit}
                onChange={(e) => patchForm({ telegram: e.target.value })}
              />
            </Field>
            <div className="settings-span-2">
              <Field label="Website">
                <input
                  placeholder="https://"
                  value={form.website}
                  disabled={!canEdit}
                  onChange={(e) => patchForm({ website: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Город">
              <input
                value={form.city}
                disabled={!canEdit}
                onChange={(e) => patchForm({ city: e.target.value })}
              />
            </Field>
            <Field label="Адрес">
              <input
                value={form.legal_address}
                disabled={!canEdit}
                onChange={(e) => patchForm({ legal_address: e.target.value })}
              />
            </Field>
          </div>
          <SaveBar
            onSave={() =>
              saveSection([
                "contact_phone",
                "contact_phone_secondary",
                "contact_email",
                "telegram",
                "website",
                "city",
                "legal_address",
              ])
            }
          />
        </section>
      );
    }

    if (section === "education") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Учебный процесс</h2>
            <p className="muted">Значения по умолчанию для расписания и групп</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Длительность занятия (мин)">
              <input
                type="number"
                min={15}
                max={300}
                value={edu.default_lesson_duration_minutes}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("education", {
                    default_lesson_duration_minutes: Number(e.target.value) || 90,
                  })
                }
              />
            </Field>
            <Field label="Вместимость группы по умолчанию">
              <input
                type="number"
                min={1}
                max={100}
                value={edu.default_group_capacity}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("education", {
                    default_group_capacity: Number(e.target.value) || 12,
                  })
                }
              />
            </Field>
            <Field label="Начало рабочего дня">
              <input
                type="time"
                value={edu.working_hours_start}
                disabled={!canEdit}
                onChange={(e) => patchSettings("education", { working_hours_start: e.target.value })}
              />
            </Field>
            <Field label="Конец рабочего дня">
              <input
                type="time"
                value={edu.working_hours_end}
                disabled={!canEdit}
                onChange={(e) => patchSettings("education", { working_hours_end: e.target.value })}
              />
            </Field>
            <div className="settings-span-2">
              <p className="settings-field-label">Рабочие дни</p>
              <div className="settings-weekday-row">
                {WEEKDAYS.map((day) => {
                  const active = (edu.working_days || []).includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      disabled={!canEdit}
                      className={`settings-weekday${active ? " is-active" : ""}`}
                      onClick={() => {
                        const set = new Set(edu.working_days || []);
                        if (set.has(day.value)) set.delete(day.value);
                        else set.add(day.value);
                        patchSettings("education", {
                          working_days: [...set].sort((a, b) => a - b),
                        });
                      }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <SaveBar onSave={() => saveSection([], "education")} />
        </section>
      );
    }

    if (section === "finance") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Финансы</h2>
            <p className="muted">Правила оплаты и напоминаний о долге. Платежи — в разделе Биллинг.</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Валюта центра">
              <input value={form.currency} disabled />
            </Field>
            <Field label="День оплаты (число месяца)">
              <input
                type="number"
                min={1}
                max={28}
                value={fin.payment_due_day}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("finance", { payment_due_day: Number(e.target.value) || 10 })
                }
              />
            </Field>
            <Field label="Льготный период (дней)">
              <input
                type="number"
                min={0}
                max={60}
                value={fin.grace_period_days}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("finance", { grace_period_days: Number(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Порог предупреждения о долге">
              <input
                type="number"
                min={0}
                value={fin.debt_warning_threshold}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("finance", {
                    debt_warning_threshold: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field label="Способ оплаты по умолчанию">
              <select
                value={fin.default_payment_method}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("finance", { default_payment_method: e.target.value })
                }
              >
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="transfer">Перевод</option>
              </select>
            </Field>
            <Field label="Напоминать об оплате за (дней)">
              <input
                type="number"
                min={0}
                max={30}
                value={fin.payment_reminder_days ?? 3}
                disabled={!canEdit}
                onChange={(e) =>
                  patchSettings("finance", {
                    payment_reminder_days: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
          </div>
          <SaveBar onSave={() => saveSection([], "finance")} />
        </section>
      );
    }

    if (section === "notifications") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Уведомления</h2>
            <p className="muted">Какие операционные события показывать владельцу и админам</p>
          </header>
          <div className="settings-toggle-list">
            {NOTIF_CATEGORIES.map(([key, label]) => (
              <label key={key} className="settings-toggle-row">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(notif[key])}
                  disabled={!canEdit}
                  onChange={(e) => patchSettings("notifications", { [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
          <h3 className="settings-subhead">Каналы</h3>
          <div className="settings-toggle-list">
            {[
              ["channel_in_app", "В приложении"],
              ["channel_push", "Push"],
              ["channel_email", "Email"],
            ].map(([key, label]) => (
              <label key={key} className="settings-toggle-row">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(notif[key])}
                  disabled={!canEdit}
                  onChange={(e) => patchSettings("notifications", { [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
          <SaveBar onSave={() => saveSection([], "notifications")} />
        </section>
      );
    }

    if (section === "roles") {
      const overview = data?.role_overview || [];
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Пользователи и роли</h2>
            <p className="muted">
              Обзор прав по ролям. Управление сотрудниками — в разделе «Команда».
            </p>
          </header>
          <div className="settings-role-profile">
            <span>Ваша роль:</span>
            <strong>{ROLE_LABELS[membership?.role] || membership?.role || "—"}</strong>
          </div>
          <div className="settings-role-table-wrap">
            <table className="settings-role-table">
              <thead>
                <tr>
                  <th>Роль</th>
                  {ROLE_CAPS.map(([_, label]) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.map((row) => (
                  <tr key={row.role}>
                    <td>{row.label}</td>
                    {ROLE_CAPS.map(([key]) => (
                      <td key={key}>{row[key] ? "✓" : "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (section === "integrations") {
      const integrations = Object.values(data?.integrations || {});
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Интеграции</h2>
            <p className="muted">Статус подключений платформы для этого центра</p>
          </header>
          <ul className="settings-integration-list">
            {integrations.map((item) => (
              <li key={item.key}>
                <div>
                  <strong>{item.label}</strong>
                  <span className="muted">
                    {item.configured
                      ? "Настроено на стороне платформы"
                      : "Не подключено"}
                  </span>
                </div>
                <span className={`settings-integration-badge${item.configured ? " is-on" : ""}`}>
                  {item.configured ? "Подключено" : "Не подключено"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    if (section === "security") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Безопасность</h2>
            <p className="muted">Смена пароля вашей учётной записи</p>
          </header>
          <form className="settings-form-grid" onSubmit={changePassword}>
            <Field label="Текущий пароль">
              <input
                type="password"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, current_password: e.target.value })
                }
              />
            </Field>
            <Field label="Новый пароль">
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, new_password: e.target.value })
                }
              />
            </Field>
            <div className="settings-span-2">
              <Field label="Подтверждение">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                />
              </Field>
            </div>
            <div className="settings-save-bar settings-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение…" : "Обновить пароль"}
              </Button>
            </div>
          </form>

          {canEdit ? (
            <div className="settings-danger">
              <h3>Опасная зона</h3>
              <p className="muted">Сброс логотипа и цветов к значениям по умолчанию.</p>
              <Button type="button" variant="secondary" onClick={() => setResetOpen(true)}>
                Сбросить брендинг
              </Button>
            </div>
          ) : null}
        </section>
      );
    }

    return null;
  }

  return (
    <div className="settings-page">
      <PageHeader
        title="Настройки"
        subtitle="Параметры учебного центра и вашей учётной записи"
      />
      <Banner>{error}</Banner>
      {info ? <div className="settings-toast">{info}</div> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}

      {!loading && form ? (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Разделы настроек">
            <select
              className="settings-nav-select"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              {SECTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ul className="settings-nav-list">
              {SECTIONS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`settings-nav-item${section === item.id ? " is-active" : ""}`}
                    onClick={() => setSection(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="settings-content">{renderSection()}</div>
        </div>
      ) : null}

      {resetOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Сброс брендинга">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setResetOpen(false)}
          />
          <div className="sheet settings-confirm-sheet">
            <div className="sheet-head">
              <div>
                <h2>Сбросить брендинг?</h2>
                <p className="muted">Логотип будет удалён, цвета вернутся к значениям по умолчанию.</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                aria-label="Закрыть"
                onClick={() => setResetOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="sheet-foot">
              <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>
                Отмена
              </Button>
              <Button type="button" disabled={saving} onClick={resetBranding}>
                {saving ? "Сброс…" : "Сбросить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
