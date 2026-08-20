import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banner,
  Badge,
  Button,
  DataTable,
  Field,
  PageHeader,
  StatCard,
  TextAction,
} from "@/components/ui";
import { LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import {
  enterEducationCenter,
  listPlatformTenants,
  patchPlatformTenant,
  platformStudentsSummary,
} from "@/services/tenant";
import { addDays, formatDate, money, today } from "@/utils/format";
import { educationHomePath } from "@/utils/routes";

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const end = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
  const start = new Date(`${today()}T12:00:00`);
  return Math.round((end - start) / 86400000);
}

function attentionReason(row) {
  if (!row.is_active || row.license_status === "suspended") return "Отключён";
  if (row.license_status === "expired") return "Лицензия истекла";
  const left = daysUntil(row.licensed_until);
  if (left != null && left <= 14 && left >= 0) {
    return left === 0 ? "Истекает сегодня" : `Истекает через ${left} дн.`;
  }
  if (!row.contract_number) return "Нет номера договора";
  return "";
}

export default function SuperDashboardPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setError("");
    try {
      const [centers, studentsSummary] = await Promise.all([
        listPlatformTenants(),
        platformStudentsSummary(),
      ]);
      setTenants(centers);
      setSummary(studentsSummary);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function extendLicense(row, days = 30) {
    setError("");
    setInfo("");
    setBusyId(row.id);
    try {
      await patchPlatformTenant(row.id, {
        licensed_until: addDays(row.licensed_until, days),
        is_active: true,
      });
      setInfo(`«${row.name}»: лицензия продлена на ${days} дней.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function toggleActive(row) {
    setError("");
    setInfo("");
    setBusyId(row.id);
    try {
      await patchPlatformTenant(row.id, { is_active: !row.is_active });
      setInfo(`«${row.name}»: ${row.is_active ? "отключён" : "включён"}.`);
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

  const paid = tenants.filter((row) => row.license_status === "active").length;
  const expired = tenants.filter((row) => row.license_status === "expired").length;
  const trial = tenants.filter((row) => row.license_status === "trial").length;
  const suspended = tenants.filter(
    (row) => !row.is_active || row.license_status === "suspended",
  ).length;
  const mrr = tenants.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0);
  const studentsTotal = tenants.reduce((sum, row) => sum + Number(row.student_count || 0), 0);

  const attention = useMemo(
    () =>
      tenants
        .map((row) => ({ ...row, reason: attentionReason(row) }))
        .filter((row) => row.reason)
        .sort((a, b) => {
          const leftA = daysUntil(a.licensed_until);
          const leftB = daysUntil(b.licensed_until);
          if (leftA == null) return 1;
          if (leftB == null) return -1;
          return leftA - leftB;
        }),
    [tenants],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((row) =>
      [row.name, row.slug, row.city, row.contract_number, row.owner?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [tenants, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Платформа"
        title="Управление центрами"
        subtitle="Обзор клиентов, лицензий и быстрые действия по учебным центрам."
        actions={
          <div className="actions">
            <Link className="btn secondary" to="/super/licenses">
              Лицензии
            </Link>
            <Link className="btn" to="/super/centers?new=1">
              Подключить центр
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <section className="section-block">
        <div className="section-head">
          <h3>Платформа сейчас</h3>
          <span className="muted">Сводка по всем клиентам</span>
        </div>
        <div className="grid cols-4">
          <StatCard label="Центры" value={tenants.length} hint={`${studentsTotal} учеников`} />
          <StatCard label="Оплачено" value={paid} hint={`${trial} пробных`} />
          <StatCard label="Риск" value={expired + suspended} hint="истекло + отключено" />
          <StatCard label="MRR" value={money(mrr)} hint="сумма тарифов / мес" />
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h3>Ученики платформы</h3>
          <Link className="text-action" to="/super/students">
            Открыть реестр
          </Link>
        </div>
        <div className="grid cols-4">
          <StatCard label="Всего" value={summary?.students ?? "—"} />
          <StatCard label="Активные" value={summary?.active ?? "—"} />
          <StatCard label="С абонементом" value={summary?.with_active_subscription ?? "—"} />
          <StatCard label="Истёк абонемент" value={summary?.expired_subscription ?? "—"} />
        </div>
      </section>

      <section className="card ornament" style={{ marginBottom: 18 }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3>Быстрые действия</h3>
        </div>
        <div className="quick-actions">
          <Link className="quick-action" to="/super/centers?new=1">
            <strong>Новый учебный центр</strong>
            <span>Онбординг: юр. данные, владелец, договор</span>
          </Link>
          <Link className="quick-action" to="/super/centers">
            <strong>Все клиенты</strong>
            <span>Карточки, редактирование, документы</span>
          </Link>
          <Link className="quick-action" to="/super/licenses">
            <strong>Лицензии и тарифы</strong>
            <span>Продление и статусы оплаты</span>
          </Link>
          <Link className="quick-action" to="/super/students">
            <strong>База учеников</strong>
            <span>Общий реестр по всем центрам</span>
          </Link>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <h3>Требуют внимания</h3>
          <span className="muted">
            {attention.length ? `${attention.length} центров` : "Всё в порядке"}
          </span>
        </div>
        {attention.length ? (
          <ul className="attention-list">
            {attention.slice(0, 8).map((row) => (
              <li key={row.id}>
                <div className="attention-main">
                  <div>
                    <strong>{row.name}</strong>
                    <span>
                      {row.city || row.slug} · до {formatDate(row.licensed_until)}
                    </span>
                  </div>
                  <Badge
                    value={row.license_status}
                    label={row.reason || LICENSE_LABELS[row.license_status]}
                  />
                </div>
                <div className="attention-actions">
                  <Button
                    type="button"
                    className="secondary compact"
                    busy={busyId === row.id}
                    onClick={() => extendLicense(row, 30)}
                  >
                    +30 дней
                  </Button>
                  <Button
                    type="button"
                    className="secondary compact"
                    busy={busyId === row.id}
                    onClick={() => toggleActive(row)}
                  >
                    {row.is_active ? "Отключить" : "Включить"}
                  </Button>
                  <TextAction onClick={() => openCenter(row)}>Кабинет</TextAction>
                  <TextAction onClick={() => navigate(`/super/centers?id=${row.id}`)}>
                    Карточка
                  </TextAction>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Нет центров с истёкшей лицензией или без договора.</p>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Учебные центры</h3>
          <span className="muted">
            {filtered.length === tenants.length
              ? `${tenants.length} центров`
              : `${filtered.length} из ${tenants.length}`}
          </span>
        </div>

        <div className="dash-toolbar">
          <Field label="Быстрый поиск">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, город, договор, email…"
            />
          </Field>
          <div className="dash-toolbar-actions">
            <Button type="button" className="secondary" onClick={() => navigate("/super/centers")}>
              Полный список
            </Button>
            <Button type="button" onClick={() => navigate("/super/centers?new=1")}>
              Подключить
            </Button>
          </div>
        </div>

        <DataTable
          rows={filtered}
          empty={tenants.length ? "Ничего не найдено" : "Центров пока нет — подключите первый"}
          columns={[
            {
              key: "name",
              title: "Центр",
              render: (row) => (
                <div className="center-cell">
                  <strong>{row.name}</strong>
                  <span>
                    {[row.city, PLAN_LABELS[row.plan] || row.plan].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ),
            },
            {
              key: "licensed_until",
              title: "Оплачено до",
              render: (row) => formatDate(row.licensed_until),
            },
            {
              key: "student_count",
              title: "Ученики",
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
              stopRowClick: true,
              render: (row) => (
                <div className="table-actions">
                  <Button
                    type="button"
                    className="secondary compact"
                    busy={busyId === row.id}
                    onClick={() => extendLicense(row, 30)}
                  >
                    +30
                  </Button>
                  <Button
                    type="button"
                    className="secondary compact"
                    busy={busyId === row.id}
                    onClick={() => toggleActive(row)}
                  >
                    {row.is_active ? "Откл." : "Вкл."}
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
    </div>
  );
}
