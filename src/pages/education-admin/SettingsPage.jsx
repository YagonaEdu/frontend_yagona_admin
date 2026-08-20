import { Banner, PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";

export default function SettingsPage() {
  const session = getSession();
  const membership = currentMembership(session);

  return (
    <div>
      <PageHeader
        title="Настройки"
        subtitle="Профиль сотрудника и текущий учебный центр."
      />
      <Banner tone="ok">
        Смена центра — в сайдбаре (если у вас несколько membership). Переключение Super Admin —
        кнопка «Кабинет Yagona» для is_superuser.
      </Banner>
      <div className="card">
        <dl className="meta-list">
          <div>
            <dt>Пользователь</dt>
            <dd>{session.user?.name || session.user?.email || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{session.user?.email || "—"}</dd>
          </div>
          <div>
            <dt>Центр</dt>
            <dd>{membership?.tenant_name || "—"}</dd>
          </div>
          <div>
            <dt>Роль</dt>
            <dd>{ROLE_LABELS[membership?.role] || membership?.role || "—"}</dd>
          </div>
          <div>
            <dt>Режим</dt>
            <dd>yagona_education_admin</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
