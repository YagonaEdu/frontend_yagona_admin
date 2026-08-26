import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Field, PageHeader, PhoneInput } from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { api, getSession, setSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatUzPhone, toApiPhone } from "@/utils/format";

const SECTIONS = [
  { id: "profile", label: "Профиль" },
  { id: "center", label: "Учебный центр" },
  { id: "education", label: "Учебный процесс" },
  { id: "reception", label: "CRM и ресепшн" },
  { id: "payments", label: "Платежи" },
  { id: "notifications", label: "Уведомления" },
  { id: "interface", label: "Интерфейс" },
  { id: "security", label: "Безопасность" },
];

const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "bank_transfer", label: "Перевод" },
  { value: "click", label: "Click" },
  { value: "payme", label: "Payme" },
];

const QUICK_ACTIONS = [
  { id: "visitor", label: "Новый посетитель" },
  { id: "student", label: "Добавить ученика" },
  { id: "trial", label: "Пробный урок" },
  { id: "payment", label: "Принять оплату" },
  { id: "find_student", label: "Найти ученика" },
  { id: "find_teacher", label: "Найти преподавателя" },
  { id: "notify", label: "Отправить уведомление" },
];

const LEAD_SOURCES = [
  { value: "manual", label: "Вручную / ресепшн" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "website", label: "Сайт" },
  { value: "other", label: "Другое" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function SaveBar({ saving, disabled, onSave }) {
  return (
    <div className="settings-save-bar">
      <Button type="button" disabled={saving || disabled} onClick={onSave}>
        {saving ? "Сохранение…" : "Сохранить изменения"}
      </Button>
    </div>
  );
}

export default function AdminSettingsPage() {
  const session = useAuth();
  const membership = useMemo(() => currentMembership(session), [session]);
  const tenantId = session.tenantId || "";
  const membershipKey = membership?.id || "";
  const [section, setSection] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [tenant, setTenant] = useState(null);
  const [centerForm, setCenterForm] = useState(null);
  const [settings, setSettings] = useState(null);

  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    position: "",
    language: "ru",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [membershipId, setMembershipId] = useState("");

  const toast = useCallback((message) => {
    setInfo(message);
    window.setTimeout(() => setInfo(""), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const liveSession = getSession();
      const live = currentMembership(liveSession);
      const [settingsPayload, me] = await Promise.all([
        api.get("/tenant/settings", { cache: true }),
        api.get("/me", { cache: true }),
      ]);

      setTenant(settingsPayload);
      setMembershipId(live?.id || "");
      setCenterForm({
        name: settingsPayload.name || "",
        contact_phone: formatUzPhone(settingsPayload.contact_phone || ""),
        contact_phone_secondary: formatUzPhone(settingsPayload.contact_phone_secondary || ""),
        contact_email: settingsPayload.contact_email || "",
        legal_address: settingsPayload.legal_address || "",
        city: settingsPayload.city || "",
        telegram: settingsPayload.telegram || "",
        website: settingsPayload.website || "",
        currency: settingsPayload.currency || "UZS",
        language: settingsPayload.language || "ru",
        timezone: settingsPayload.timezone || "Asia/Tashkent",
      });
      setSettings(clone(settingsPayload.center_settings || {}));
      setProfile({
        first_name: me.first_name || "",
        last_name: me.last_name || "",
        phone: formatUzPhone(me.phone || ""),
        email: me.email || "",
        position: live?.position || "Администратор",
        language: settingsPayload.language || "ru",
      });
    } catch (err) {
      setError(err.message || "Не удалось загрузить настройки.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, tenantId, membershipKey]);

  function patchSettings(sectionKey, patch) {
    setSettings((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev?.[sectionKey] || {}),
        ...patch,
      },
    }));
  }

  async function saveCenter(fields) {
    setSaving(true);
    setError("");
    try {
      const payload = {};
      fields.forEach((key) => {
        if (String(key).includes("phone")) {
          payload[key] = toApiPhone(centerForm[key]) || null;
        } else {
          payload[key] = centerForm[key];
        }
      });
      const updated = await api.patch("/tenant/settings", payload);
      setTenant(updated);
      toast("Изменения сохранены");
    } catch (err) {
      setError(err.message || "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettingsSection(sectionKey) {
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch("/tenant/settings", {
        center_settings: {
          [sectionKey]: settings[sectionKey],
        },
      });
      setSettings(clone(updated.center_settings || {}));
      toast("Изменения сохранены");
    } catch (err) {
      setError(err.message || "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError("");
    try {
      const me = await api.patch("/me", {
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        phone: toApiPhone(profile.phone),
        email: profile.email.trim() || "",
      });
      if (membershipId && profile.position.trim()) {
        try {
          await api.patch(`/staff/${membershipId}`, {
            position: profile.position.trim(),
          });
        } catch {
          // position update is best-effort if staff write is restricted
        }
      }
      if (profile.language && profile.language !== centerForm?.language) {
        await api.patch("/tenant/settings", { language: profile.language });
        setCenterForm((prev) => ({ ...prev, language: profile.language }));
      }
      setSession({
        user: {
          ...(session.user || {}),
          ...me,
          name: me.name || [me.first_name, me.last_name].filter(Boolean).join(" "),
        },
      });
      toast("Профиль сохранён");
    } catch (err) {
      setError(err.message || "Не удалось сохранить профиль.");
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
    if (passwordForm.new_password.length < 8) {
      setError("Новый пароль не короче 8 символов.");
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

  const edu = settings?.education || {};
  const fin = settings?.finance || {};
  const notif = settings?.notifications || {};
  const reception = settings?.reception || {};

  const content = useMemo(() => {
    if (!centerForm || !settings) return null;

    if (section === "profile") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Профиль</h2>
            <p className="muted">Ваши данные для работы на ресепшн</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Имя">
              <input
                value={profile.first_name}
                onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
              />
            </Field>
            <Field label="Фамилия">
              <input
                value={profile.last_name}
                onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
              />
            </Field>
            <Field label="Телефон">
              <PhoneInput
                value={profile.phone}
                onChange={(phone) => setProfile((p) => ({ ...p, phone }))}
              />
            </Field>
            <Field label="Email">
              <input
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="Должность">
              <input
                value={profile.position}
                onChange={(e) => setProfile((p) => ({ ...p, position: e.target.value }))}
              />
            </Field>
            <Field label="Язык интерфейса">
              <select
                value={profile.language}
                onChange={(e) => setProfile((p) => ({ ...p, language: e.target.value }))}
              >
                <option value="ru">Русский</option>
                <option value="uz">Oʻzbekcha</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Роль">
              <input readOnly value={ROLE_LABELS.admin || "Администратор"} />
            </Field>
            <Field label="Учебный центр">
              <input readOnly value={membership?.tenant_name || tenant?.name || "—"} />
            </Field>
          </div>
          <SaveBar saving={saving} onSave={saveProfile} />
        </section>
      );
    }

    if (section === "center") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Учебный центр</h2>
            <p className="muted">Контакты и адрес для ежедневной работы</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Название">
              <input
                value={centerForm.name}
                onChange={(e) => setCenterForm((p) => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Город">
              <input
                value={centerForm.city}
                onChange={(e) => setCenterForm((p) => ({ ...p, city: e.target.value }))}
              />
            </Field>
            <Field label="Основной телефон">
              <PhoneInput
                value={centerForm.contact_phone}
                onChange={(phone) => setCenterForm((p) => ({ ...p, contact_phone: phone }))}
              />
            </Field>
            <Field label="Дополнительный телефон">
              <PhoneInput
                value={centerForm.contact_phone_secondary}
                onChange={(phone) =>
                  setCenterForm((p) => ({ ...p, contact_phone_secondary: phone }))
                }
              />
            </Field>
            <Field label="Email">
              <input
                value={centerForm.contact_email}
                onChange={(e) => setCenterForm((p) => ({ ...p, contact_email: e.target.value }))}
              />
            </Field>
            <Field label="Telegram">
              <input
                value={centerForm.telegram}
                onChange={(e) => setCenterForm((p) => ({ ...p, telegram: e.target.value }))}
              />
            </Field>
            <Field label="Website">
              <input
                value={centerForm.website}
                onChange={(e) => setCenterForm((p) => ({ ...p, website: e.target.value }))}
              />
            </Field>
            <Field label="Адрес">
              <input
                value={centerForm.legal_address}
                onChange={(e) => setCenterForm((p) => ({ ...p, legal_address: e.target.value }))}
              />
            </Field>
            <Field label="Часовой пояс">
              <input readOnly value={centerForm.timezone} />
            </Field>
          </div>
          <p className="muted settings-hint">
            Рабочие дни и часы настраиваются в разделе «Учебный процесс».
          </p>
          <SaveBar
            saving={saving}
            onSave={() =>
              saveCenter([
                "name",
                "city",
                "contact_phone",
                "contact_phone_secondary",
                "contact_email",
                "telegram",
                "website",
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
                value={edu.default_lesson_duration_minutes ?? 90}
                onChange={(e) =>
                  patchSettings("education", {
                    default_lesson_duration_minutes: Number(e.target.value) || 90,
                  })
                }
              />
            </Field>
            <Field label="Длительность пробного (мин)">
              <input
                type="number"
                min={15}
                value={edu.trial_lesson_duration_minutes ?? 60}
                onChange={(e) =>
                  patchSettings("education", {
                    trial_lesson_duration_minutes: Number(e.target.value) || 60,
                  })
                }
              />
            </Field>
            <Field label="Вместимость группы">
              <input
                type="number"
                min={1}
                value={edu.default_group_capacity ?? 12}
                onChange={(e) =>
                  patchSettings("education", {
                    default_group_capacity: Number(e.target.value) || 12,
                  })
                }
              />
            </Field>
            <Field label="Вид расписания">
              <select
                value={edu.default_schedule_view || "week"}
                onChange={(e) =>
                  patchSettings("education", { default_schedule_view: e.target.value })
                }
              >
                <option value="day">День</option>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
            </Field>
            <Field label="Начало дня">
              <input
                type="time"
                value={edu.working_hours_start || "09:00"}
                onChange={(e) =>
                  patchSettings("education", { working_hours_start: e.target.value })
                }
              />
            </Field>
            <Field label="Конец дня">
              <input
                type="time"
                value={edu.working_hours_end || "21:00"}
                onChange={(e) =>
                  patchSettings("education", { working_hours_end: e.target.value })
                }
              />
            </Field>
            <Field label="Первый день недели">
              <select
                value={edu.first_weekday ?? 1}
                onChange={(e) =>
                  patchSettings("education", { first_weekday: Number(e.target.value) })
                }
              >
                <option value={1}>Понедельник</option>
                <option value={7}>Воскресенье</option>
              </select>
            </Field>
          </div>
          <div className="settings-weekdays">
            <span className="field-label">Рабочие дни</span>
            <div className="settings-weekday-row">
              {WEEKDAYS.map((day) => {
                const active = (edu.working_days || []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    className={`settings-weekday${active ? " is-active" : ""}`}
                    onClick={() => {
                      const current = new Set(edu.working_days || []);
                      if (current.has(day.value)) current.delete(day.value);
                      else current.add(day.value);
                      patchSettings("education", {
                        working_days: [...current].sort((a, b) => a - b),
                      });
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <SaveBar saving={saving} onSave={() => saveSettingsSection("education")} />
        </section>
      );
    }

    if (section === "reception") {
      const actions = new Set(reception.quick_actions || []);
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>CRM и ресепшн</h2>
            <p className="muted">Ускорение записи посетителей и follow-up</p>
          </header>
          <h3 className="settings-subhead">Новый посетитель</h3>
          <div className="settings-form-grid">
            <Field label="Источник по умолчанию">
              <select
                value={reception.default_lead_source || "manual"}
                onChange={(e) =>
                  patchSettings("reception", { default_lead_source: e.target.value })
                }
              >
                {LEAD_SOURCES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Срок следующего контакта">
              <select
                value={reception.default_followup_days ?? 1}
                onChange={(e) =>
                  patchSettings("reception", {
                    default_followup_days: Number(e.target.value),
                  })
                }
              >
                <option value={1}>1 день</option>
                <option value={3}>3 дня</option>
                <option value={7}>7 дней</option>
              </select>
            </Field>
          </div>
          <div className="settings-check-list">
            <label>
              <input
                type="checkbox"
                checked={Boolean(reception.show_overdue_followups)}
                onChange={(e) =>
                  patchSettings("reception", { show_overdue_followups: e.target.checked })
                }
              />
              Показывать просроченные follow-up на рабочем столе
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(reception.warn_duplicate_phone)}
                onChange={(e) =>
                  patchSettings("reception", { warn_duplicate_phone: e.target.checked })
                }
              />
              Предупреждать при совпадении телефона
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(reception.warn_duplicate_email)}
                onChange={(e) =>
                  patchSettings("reception", { warn_duplicate_email: e.target.checked })
                }
              />
              Предупреждать при совпадении email
            </label>
          </div>
          <h3 className="settings-subhead">Быстрые действия на рабочем столе</h3>
          <div className="settings-check-list">
            {QUICK_ACTIONS.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={actions.has(item.id)}
                  onChange={(e) => {
                    const next = new Set(actions);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    patchSettings("reception", { quick_actions: [...next] });
                  }}
                />
                {item.label}
              </label>
            ))}
          </div>
          <SaveBar saving={saving} onSave={() => saveSettingsSection("reception")} />
        </section>
      );
    }

    if (section === "payments") {
      const allowed = new Set(fin.allowed_payment_methods || []);
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Платежи</h2>
            <p className="muted">Настройки приёма оплаты учеников</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Валюта">
              <input
                value={centerForm.currency}
                onChange={(e) => setCenterForm((p) => ({ ...p, currency: e.target.value }))}
              />
            </Field>
            <Field label="День оплаты по умолчанию">
              <input
                type="number"
                min={1}
                max={28}
                value={fin.payment_due_day ?? 10}
                onChange={(e) =>
                  patchSettings("finance", { payment_due_day: Number(e.target.value) || 10 })
                }
              />
            </Field>
            <Field label="Способ оплаты по умолчанию">
              <select
                value={fin.default_payment_method || "cash"}
                onChange={(e) =>
                  patchSettings("finance", { default_payment_method: e.target.value })
                }
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Напоминать за (дней)">
              <select
                value={fin.payment_reminder_days ?? 3}
                onChange={(e) =>
                  patchSettings("finance", {
                    payment_reminder_days: Number(e.target.value),
                  })
                }
              >
                {[1, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <h3 className="settings-subhead">Разрешённые способы оплаты</h3>
          <div className="settings-check-list">
            {PAYMENT_METHODS.map((item) => (
              <label key={item.value}>
                <input
                  type="checkbox"
                  checked={allowed.has(item.value)}
                  onChange={(e) => {
                    const next = new Set(allowed);
                    if (e.target.checked) next.add(item.value);
                    else next.delete(item.value);
                    patchSettings("finance", { allowed_payment_methods: [...next] });
                  }}
                />
                {item.label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={Boolean(fin.payment_reminders_enabled)}
                onChange={(e) =>
                  patchSettings("finance", { payment_reminders_enabled: e.target.checked })
                }
              />
              Напоминать о приближении оплаты
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(fin.show_debtors_on_dashboard)}
                onChange={(e) =>
                  patchSettings("finance", { show_debtors_on_dashboard: e.target.checked })
                }
              />
              Показывать должников на рабочем столе
            </label>
          </div>
          <div className="settings-readonly-box">
            <p>
              Вы можете принимать платежи: <strong>Да</strong>
            </p>
            <p>
              Возврат платежей: <strong>Нет</strong>
            </p>
          </div>
          <SaveBar
            saving={saving}
            onSave={async () => {
              setSaving(true);
              setError("");
              try {
                await api.patch("/tenant/settings", {
                  currency: centerForm.currency,
                  center_settings: { finance: settings.finance },
                });
                toast("Изменения сохранены");
                await load();
              } catch (err) {
                setError(err.message || "Не удалось сохранить.");
              } finally {
                setSaving(false);
              }
            }}
          />
        </section>
      );
    }

    if (section === "notifications") {
      const rows = [
        ["crm_new_lead", "CRM · Новый лид"],
        ["crm_followup_today", "CRM · Follow-up сегодня"],
        ["crm_followup_overdue", "CRM · Просроченный follow-up"],
        ["students_new", "Ученики · Новый ученик"],
        ["attendance_unmarked", "Посещаемость · Не отмечена"],
        ["schedule_conflict", "Расписание · Конфликт"],
        ["schedule_no_teacher", "Расписание · Нет преподавателя"],
        ["payment_received", "Платежи · Оплата получена"],
        ["payment_overdue", "Платежи · Просрочена"],
        ["debt", "Платежи · Задолженность"],
        ["trial_today", "Пробные · Сегодня"],
        ["trial_no_show", "Пробные · Не пришёл"],
      ];
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Уведомления</h2>
            <p className="muted">Какие операционные события важны для ресепшн</p>
          </header>
          <div className="settings-check-list">
            {rows.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(notif[key])}
                  onChange={(e) => patchSettings("notifications", { [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <h3 className="settings-subhead">Каналы</h3>
          <div className="settings-check-list">
            <label>
              <input
                type="checkbox"
                checked={Boolean(notif.channel_in_app)}
                onChange={(e) =>
                  patchSettings("notifications", { channel_in_app: e.target.checked })
                }
              />
              В приложении
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(notif.channel_push)}
                onChange={(e) =>
                  patchSettings("notifications", { channel_push: e.target.checked })
                }
              />
              Push
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(notif.channel_email)}
                onChange={(e) =>
                  patchSettings("notifications", { channel_email: e.target.checked })
                }
              />
              Email
            </label>
          </div>
          <SaveBar saving={saving} onSave={() => saveSettingsSection("notifications")} />
        </section>
      );
    }

    if (section === "interface") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Интерфейс</h2>
            <p className="muted">Личные предпочтения отображения</p>
          </header>
          <div className="settings-form-grid">
            <Field label="Язык">
              <select
                value={reception.ui_language || "ru"}
                onChange={(e) => patchSettings("reception", { ui_language: e.target.value })}
              >
                <option value="ru">Русский</option>
                <option value="uz">Oʻzbekcha</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Формат даты">
              <select
                value={reception.date_format || "dd.mm.yyyy"}
                onChange={(e) => patchSettings("reception", { date_format: e.target.value })}
              >
                <option value="dd.mm.yyyy">ДД.ММ.ГГГГ</option>
                <option value="yyyy-mm-dd">ГГГГ-ММ-ДД</option>
              </select>
            </Field>
            <Field label="Вид расписания">
              <select
                value={reception.default_schedule_view || "week"}
                onChange={(e) =>
                  patchSettings("reception", { default_schedule_view: e.target.value })
                }
              >
                <option value="day">День</option>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
            </Field>
            <Field label="Плотность таблиц">
              <select
                value={reception.table_density || "normal"}
                onChange={(e) => patchSettings("reception", { table_density: e.target.value })}
              >
                <option value="compact">Компактная</option>
                <option value="normal">Обычная</option>
              </select>
            </Field>
            <Field label="Первый день недели">
              <select
                value={reception.first_weekday ?? 1}
                onChange={(e) =>
                  patchSettings("reception", { first_weekday: Number(e.target.value) })
                }
              >
                <option value={1}>Понедельник</option>
                <option value={7}>Воскресенье</option>
              </select>
            </Field>
          </div>
          <SaveBar saving={saving} onSave={() => saveSettingsSection("reception")} />
        </section>
      );
    }

    if (section === "security") {
      return (
        <section className="settings-panel">
          <header className="settings-panel-head">
            <h2>Безопасность</h2>
            <p className="muted">Только ваша учётная запись</p>
          </header>
          <div className="settings-readonly-box">
            <p>
              Логин: <strong>{profile.email || profile.phone || "—"}</strong>
            </p>
            <p className="muted">Сессии других устройств и DeviceToken пока не доступны в API.</p>
          </div>
          <form className="settings-form-grid" onSubmit={changePassword}>
            <Field label="Текущий пароль">
              <input
                type="password"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm((p) => ({ ...p, current_password: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Новый пароль">
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm((p) => ({ ...p, new_password: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Подтверждение">
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                required
              />
            </Field>
            <div className="settings-save-bar settings-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение…" : "Сменить пароль"}
              </Button>
            </div>
          </form>
        </section>
      );
    }

    return null;
  }, [
    section,
    centerForm,
    settings,
    profile,
    passwordForm,
    saving,
    membership,
    tenant,
    edu,
    fin,
    notif,
    reception,
  ]);

  return (
    <div className="settings-page admin-settings-page">
      <PageHeader
        title="Настройки"
        subtitle="Операционные параметры ресепшн и вашего профиля"
      />
      {error ? <Banner>{error}</Banner> : null}
      {info ? <div className="settings-toast">{info}</div> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}

      {!loading && centerForm && settings ? (
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
          <div className="settings-content">{content}</div>
        </div>
      ) : null}
    </div>
  );
}
