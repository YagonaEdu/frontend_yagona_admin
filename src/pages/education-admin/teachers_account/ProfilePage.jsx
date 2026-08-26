import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { YagonaLogo } from "@/components/brand";
import {
  Avatar,
  Banner,
  Button,
  Field,
  PhoneInput,
} from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { api, getSession, setSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { educationSegmentPath } from "@/utils/routes";
import { formatUzPhone, toApiPhone } from "@/utils/format";
import { buildScheduleSummary } from "./groupHelpers";
import { asList, membershipName } from "./utils";

function studentsLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ученик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ученика`;
  return `${n} учеников`;
}

function ProfileSkeleton() {
  return (
    <div className="tp-page" aria-busy="true" aria-live="polite">
      <div className="tp-skeleton tp-skeleton-header" />
      <div className="tp-layout">
        <div className="tp-main">
          <div className="tp-skeleton tp-skeleton-block" />
          <div className="tp-skeleton tp-skeleton-block" />
          <div className="tp-skeleton tp-skeleton-block" />
        </div>
        <aside className="tp-aside">
          <div className="tp-skeleton tp-skeleton-aside" />
          <div className="tp-skeleton tp-skeleton-aside" />
        </aside>
      </div>
    </div>
  );
}

function EditProfileSheet({
  open,
  form,
  position,
  saving,
  error,
  onClose,
  onChange,
  onPositionChange,
  onSave,
  onRetry,
}) {
  if (!open) return null;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="tp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tp-sheet-head">
          <div>
            <h2 id="tp-edit-title">Редактировать профиль</h2>
            <p className="muted">Измените личные данные и должность</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <form className="tp-sheet-body" onSubmit={onSave}>
          {error ? (
            <Banner>
              {error}
              {onRetry ? (
                <button type="button" className="tp-retry" onClick={onRetry}>
                  Повторить
                </button>
              ) : null}
            </Banner>
          ) : null}
          <div className="tp-form-grid">
            <Field label="Имя">
              <input
                name="first_name"
                autoComplete="given-name"
                value={form.first_name}
                onChange={(e) => onChange({ ...form, first_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Фамилия">
              <input
                name="last_name"
                autoComplete="family-name"
                value={form.last_name}
                onChange={(e) => onChange({ ...form, last_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Телефон">
              <PhoneInput
                value={form.phone}
                onChange={(phone) => onChange({ ...form, phone })}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Должность">
              <input
                name="position"
                value={position}
                onChange={(e) => onPositionChange(e.target.value)}
                placeholder="Например, English Teacher"
              />
            </Field>
          </div>
          <div className="tp-sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function TeacherProfilePage() {
  const { tenantSlug = "" } = useParams();
  const session = getSession();
  const membership = currentMembership(session);
  const roleLabel = ROLE_LABELS[membership?.role] || ROLE_LABELS.teacher || "Преподаватель";

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rules, setRules] = useState([]);
  const [position, setPosition] = useState(membership?.position || "");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const [editPosition, setEditPosition] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");

  const path = useCallback(
    (segment) => educationSegmentPath(tenantSlug, segment),
    [tenantSlug],
  );

  const displayName = membershipName(membership, session.user);
  const centerName =
    tenant?.short_name ||
    tenant?.name ||
    membership?.tenant_name ||
    "Учебный центр";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [me, settings, groupRows, courseRows, ruleRows] = await Promise.all([
        api.get("/me", { tenant: false }).catch(() => session.user),
        api.get("/tenant/settings").catch(() => null),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
        asList("/schedule-rules?page_size=200").catch(() => []),
      ]);
      if (me) {
        setSession({
          user: {
            ...(getSession().user || {}),
            ...me,
            name: me.name || [me.first_name, me.last_name].filter(Boolean).join(" "),
          },
        });
      }
      setTenant(settings);
      setGroups(groupRows);
      setCourses(courseRows);
      setRules(ruleRows);
      setPosition(membership?.position || "");
    } catch (err) {
      setLoadError(err.message || "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }, [membership?.position, session.user]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const courseNames = useMemo(() => {
    const ids = new Set(groups.map((row) => String(row.course)).filter(Boolean));
    return courses.filter((row) => ids.has(String(row.id))).map((row) => row.name);
  }, [groups, courses]);

  const groupCards = useMemo(() => {
    return groups.slice(0, 4).map((group) => {
      const groupRules = rules.filter(
        (row) => String(row.group) === String(group.id) && row.is_active !== false,
      );
      const schedule = buildScheduleSummary(groupRules);
      return {
        id: group.id,
        name: group.name,
        students: group.active_students ?? 0,
        scheduleDays: schedule.days,
      };
    });
  }, [groups, rules]);

  function openEdit() {
    const user = getSession().user || session.user || {};
    setEditForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: formatUzPhone(user.phone || ""),
      email: user.email || "",
    });
    setEditPosition(position || membership?.position || "");
    setProfileError("");
    setEditOpen(true);
  }

  async function saveProfile(event) {
    event?.preventDefault?.();
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      setProfileError("Укажите имя и фамилию");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const me = await api.patch(
        "/me",
        {
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          phone: toApiPhone(editForm.phone) || "",
          email: editForm.email.trim() || "",
        },
        { tenant: false },
      );

      let nextPosition = editPosition.trim();
      if (membership?.id && nextPosition !== (membership.position || "")) {
        try {
          const staff = await api.patch(`/staff/${membership.id}`, {
            position: nextPosition,
          });
          nextPosition = staff.position || nextPosition;
          const nextMemberships = (getSession().memberships || []).map((item) =>
            String(item.id) === String(membership.id)
              ? { ...item, position: nextPosition }
              : item,
          );
          setSession({ memberships: nextMemberships });
        } catch {
          /* position is best-effort */
        }
      }

      setSession({
        user: {
          ...(getSession().user || {}),
          ...me,
          name: me.name || [me.first_name, me.last_name].filter(Boolean).join(" "),
        },
      });
      setPosition(nextPosition);
      setEditOpen(false);
      setToast("Профиль сохранён");
    } catch (err) {
      setProfileError(err.message || "Не удалось сохранить изменения");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordError("");
    if (!passwordForm.current_password || !passwordForm.new_password) {
      setPasswordError("Заполните текущий и новый пароль");
      return;
    }
    if (passwordForm.new_password.length < 8) {
      setPasswordError("Новый пароль должен быть не короче 8 символов");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post(
        "/me/password",
        {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        },
        { tenant: false },
      );
      setPasswordForm({ current_password: "", new_password: "", confirm: "" });
      setToast("Пароль обновлён");
    } catch (err) {
      setPasswordError(err.message || "Не удалось сохранить изменения");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <ProfileSkeleton />;

  const user = getSession().user || session.user || {};
  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || displayName;
  const phoneDisplay = user.phone ? formatUzPhone(user.phone) : "—";
  const cityLine = tenant?.city || "";

  return (
    <div className="tp-page">
      <header className="tp-page-head">
        <div>
          <h1>Мой профиль</h1>
          <p className="muted">Управляйте личными данными и настройками</p>
        </div>
      </header>

      {loadError ? <Banner>{loadError}</Banner> : null}
      {toast ? (
        <Banner tone="ok" role="status">
          {toast}
        </Banner>
      ) : null}

      <section className="tp-header card">
        <Avatar name={fullName} size="lg" />
        <div className="tp-header-text">
          <h2>{fullName}</h2>
          <p className="tp-role">{roleLabel}</p>
          <p className="tp-center-line">
            <span className="muted">Учебный центр:</span> {centerName}
          </p>
          {position ? <p className="muted tp-position">{position}</p> : null}
          <div className="tp-header-actions">
            <Button type="button" onClick={openEdit}>
              Редактировать профиль
            </Button>
            <Link className="btn btn-ghost" to={path("groups")}>
              Мои группы
            </Link>
            <Link className="btn btn-ghost" to={path("schedule")}>
              Моё расписание
            </Link>
          </div>
        </div>
      </section>

      <div className="tp-layout">
        <div className="tp-main">
          <section className="card tp-section">
            <h3>Личная информация</h3>
            <dl className="tp-dl">
              <div>
                <dt>ФИО</dt>
                <dd>{fullName}</dd>
              </div>
              <div>
                <dt>Телефон</dt>
                <dd>{phoneDisplay}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email || "—"}</dd>
              </div>
            </dl>
            <Button type="button" variant="ghost" onClick={openEdit}>
              Изменить
            </Button>
          </section>

          <section className="card tp-section">
            <h3>Рабочая информация</h3>
            <dl className="tp-dl">
              <div>
                <dt>Роль</dt>
                <dd>
                  {roleLabel}
                  <span className="tp-readonly-hint">только просмотр</span>
                </dd>
              </div>
              <div>
                <dt>Должность</dt>
                <dd>{position || "—"}</dd>
              </div>
              <div>
                <dt>Курсы</dt>
                <dd>
                  {courseNames.length ? (
                    <ul className="tp-chip-list">
                      {courseNames.slice(0, 6).map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Группы</dt>
                <dd>
                  {groups.length ? groups.map((row) => row.name).join(", ") : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card tp-section tp-groups-mobile">
            <div className="tp-section-row">
              <h3>Мои группы</h3>
              <Link to={path("groups")} className="tp-link">
                Все группы
              </Link>
            </div>
            {groupCards.length ? (
              <ul className="tp-group-list">
                {groupCards.map((group) => (
                  <li key={group.id}>
                    <strong>{group.name}</strong>
                    <span className="muted">{studentsLabel(group.students)}</span>
                    <span className="muted">{group.scheduleDays}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Пока нет назначенных групп</p>
            )}
            {courseNames.length ? (
              <div className="tp-courses-block">
                <p className="tp-card-label">Мои курсы</p>
                <ul className="tp-chip-list">
                  {courseNames.slice(0, 4).map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="card tp-section">
            <h3>Аккаунт</h3>
            <dl className="tp-dl">
              <div>
                <dt>Email / логин</dt>
                <dd>{user.email || phoneDisplay}</dd>
              </div>
              <div>
                <dt>Роль</dt>
                <dd>{roleLabel}</dd>
              </div>
              <div>
                <dt>Учебный центр</dt>
                <dd>{centerName}</dd>
              </div>
              <div>
                <dt>Статус аккаунта</dt>
                <dd>
                  <span className="tp-status-ok">Активен</span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="card tp-section" id="security">
            <h3>Безопасность</h3>
            <p className="muted tp-section-hint">Смена пароля для входа в Yagona</p>
            <form className="tp-password-form" onSubmit={savePassword}>
              {passwordError ? <Banner>{passwordError}</Banner> : null}
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
              <Field label="Подтвердите пароль">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirm: e.target.value })
                  }
                />
              </Field>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Сохранение…" : "Изменить пароль"}
              </Button>
            </form>
          </section>
        </div>

        <aside className="tp-aside">
          <section className="card tp-center-card">
            <p className="tp-card-label">Учебный центр</p>
            {tenant?.logo_url ? (
              <img
                className="tp-center-logo"
                src={tenant.logo_url}
                alt={`Логотип ${centerName}`}
              />
            ) : null}
            <h3>{centerName}</h3>
            <p className="tp-role">{roleLabel}</p>
            <dl className="tp-dl tp-dl-compact">
              {tenant?.contact_phone ? (
                <div>
                  <dt>Телефон</dt>
                  <dd>
                    <a href={`tel:${tenant.contact_phone}`}>
                      {formatUzPhone(tenant.contact_phone)}
                    </a>
                  </dd>
                </div>
              ) : null}
              {tenant?.contact_email ? (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${tenant.contact_email}`}>{tenant.contact_email}</a>
                  </dd>
                </div>
              ) : null}
              {cityLine ? (
                <div>
                  <dt>Город</dt>
                  <dd>{cityLine}</dd>
                </div>
              ) : null}
              {tenant?.website ? (
                <div>
                  <dt>Сайт</dt>
                  <dd>
                    <a href={tenant.website} target="_blank" rel="noreferrer">
                      {tenant.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="tp-center-foot">
              <YagonaLogo size={20} mark alt="" />
              <span>{centerName} работает с Yagona</span>
            </div>
          </section>

          <section className="card tp-section tp-groups-desktop">
            <div className="tp-section-row">
              <h3>Мои группы</h3>
              <Link to={path("groups")} className="tp-link">
                Все группы
              </Link>
            </div>
            {groupCards.length ? (
              <ul className="tp-group-list">
                {groupCards.map((group) => (
                  <li key={group.id}>
                    <strong>{group.name}</strong>
                    <span className="muted">{studentsLabel(group.students)}</span>
                    <span className="muted">{group.scheduleDays}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Пока нет назначенных групп</p>
            )}
            {courseNames.length ? (
              <div className="tp-courses-block">
                <p className="tp-card-label">Мои курсы</p>
                <ul className="tp-chip-list">
                  {courseNames.slice(0, 4).map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="tp-brand-card" aria-label="Yagona">
            <YagonaLogo size={36} alt="Yagona" />
            <p className="tp-brand-quote">
              Yagona помогает сосредоточиться на главном — обучении.
            </p>
            <p className="tp-brand-sub">Платформа вашего учебного центра</p>
          </section>
        </aside>
      </div>

      <EditProfileSheet
        open={editOpen}
        form={editForm}
        position={editPosition}
        saving={savingProfile}
        error={profileError}
        onClose={() => setEditOpen(false)}
        onChange={setEditForm}
        onPositionChange={setEditPosition}
        onSave={saveProfile}
        onRetry={() => saveProfile()}
      />
    </div>
  );
}
