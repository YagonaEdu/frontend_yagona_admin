import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { STUDENT_STATUS_LABELS } from "@/constants";
import {
  enterEducationCenter,
  listPlatformStudents,
  listPlatformTenants,
  platformStudentsSummary,
} from "@/services/tenant";
import { formatDate } from "@/utils/format";
import { educationHomePath } from "@/utils/routes";

const subStatusLabel = {
  active: "активен",
  expired: "истёк",
  cancelled: "отменён",
};

function DetailRow({ label, children }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function activeSubscription(row) {
  return (row.subscriptions || []).find((item) => item.status === "active") || null;
}

export default function PlatformStudentsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [tenant, setTenant] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [subFilter, setSubFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page_size: "200" });
    if (tenant) params.set("tenant", tenant);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (subFilter === "active") params.set("has_active_subscription", "true");
    return params.toString();
  }, [tenant, status, search, subFilter]);

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [tenantData, studentData, summaryData] = await Promise.all([
          listPlatformTenants(),
          listPlatformStudents(query),
          platformStudentsSummary(tenant),
        ]);
        setTenants(tenantData);
        let nextRows = studentData;
        if (subFilter === "expired") {
          nextRows = studentData.filter((row) =>
            (row.subscriptions || []).some((item) => item.status === "expired"),
          );
        } else if (subFilter === "none") {
          nextRows = studentData.filter((row) => !(row.subscriptions || []).length);
        }
        setRows(nextRows);
        setSummary(summaryData);
        if (selected) {
          const fresh = nextRows.find((item) => item.id === selected.id);
          if (fresh) setSelected(fresh);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [query, tenant, subFilter]);

  useEffect(() => {
    if (!selected) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const hasFilters = Boolean(tenant || status || search || subFilter !== "all");

  function resetFilters() {
    setTenant("");
    setStatus("");
    setSearch("");
    setSearchInput("");
    setSubFilter("all");
  }

  function openCenter(row) {
    const center = tenants.find((item) => String(item.id) === String(row.tenant_id));
    if (!center?.slug) {
      setError("Не удалось открыть кабинет центра.");
      return;
    }
    enterEducationCenter(center.id, center.slug);
    navigate(educationHomePath(center.slug));
  }

  async function exportExcel() {
    if (!rows.length) {
      setError("Нет данных для экспорта — измените фильтры.");
      return;
    }
    setError("");
    setExporting(true);
    try {
      const { downloadExcel, excelStamp } = await import("@/utils/exportExcel");
      downloadExcel(`yagona-ucheniki_${excelStamp()}.xlsx`, rows, [
        { key: "tenant_name", title: "Центр" },
        { key: "full_name", title: "Ученик" },
        { key: "phone", title: "Телефон" },
        { key: "email", title: "Email" },
        {
          key: "status",
          title: "Статус",
          value: (row) => STUDENT_STATUS_LABELS[row.status] || row.status || "",
        },
        {
          key: "active_subscription_count",
          title: "Активных абонементов",
          value: (row) => row.active_subscription_count ?? 0,
        },
        {
          key: "subscription_count",
          title: "Всего абонементов",
          value: (row) => row.subscription_count ?? 0,
        },
        {
          key: "active_until",
          title: "Действует до",
          value: (row) => (row.active_until ? formatDate(row.active_until) : ""),
        },
        {
          key: "active_plan",
          title: "Текущий абонемент",
          value: (row) => activeSubscription(row)?.plan_name || "",
        },
        {
          key: "subscriptions",
          title: "Все абонементы",
          value: (row) =>
            (row.subscriptions || [])
              .map((item) => {
                const lessons =
                  item.total_lessons != null
                    ? `${item.remaining_lessons ?? 0}/${item.total_lessons} ур.`
                    : "по дате";
                return `${item.plan_name} (${subStatusLabel[item.status] || item.status}, ${formatDate(item.starts_on)}—${formatDate(item.ends_on)}, ${lessons})`;
              })
              .join("; "),
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
        eyebrow="Платформа"
        title="Ученики"
        subtitle="Общий реестр по всем учебным центрам: статус, абонементы и контакты."
        actions={
          <div className="actions">
            <Button
              type="button"
              className="secondary"
              busy={exporting}
              disabled={!rows.length}
              onClick={exportExcel}
            >
              Скачать Excel
            </Button>
            <Link className="btn secondary" to="/super/centers">
              Центры
            </Link>
            <Link className="btn secondary" to="/super/analytics">
              Аналитика
            </Link>
          </div>
        }
      />
      <Banner>{error}</Banner>

      <section className="section-block">
        <div className="section-head">
          <h3>Сводка</h3>
          <span className="muted">{tenant ? "По выбранному центру" : "По всей платформе"}</span>
        </div>
        <div className="grid cols-4">
          <button
            type="button"
            className="stat-hit"
            onClick={() => {
              setStatus("");
              setSubFilter("all");
            }}
          >
            <StatCard label="Ученики" value={summary?.students ?? "—"} hint="Все" />
          </button>
          <button type="button" className="stat-hit" onClick={() => setStatus("active")}>
            <StatCard label="Активные" value={summary?.active ?? "—"} hint="Фильтр: активен" />
          </button>
          <button type="button" className="stat-hit" onClick={() => setSubFilter("active")}>
            <StatCard
              label="С абонементом"
              value={summary?.with_active_subscription ?? "—"}
              hint="Действует сейчас"
            />
          </button>
          <button type="button" className="stat-hit" onClick={() => setSubFilter("expired")}>
            <StatCard
              label="Истёк абонемент"
              value={summary?.expired_subscription ?? "—"}
              hint="Фильтр: истёк"
            />
          </button>
        </div>
      </section>

      <FiltersBar>
        <div className="grid cols-4" style={{ gap: 10, alignItems: "end" }}>
          <Field label="Поиск">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Имя, телефон, email, центр…"
            />
          </Field>
          <Field label="Учебный центр">
            <select value={tenant} onChange={(event) => setTenant(event.target.value)}>
              <option value="">Все центры</option>
              {tenants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Статус ученика">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все статусы</option>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="archived">Архив</option>
            </select>
          </Field>
          <Field label="Абонемент">
            <select value={subFilter} onChange={(event) => setSubFilter(event.target.value)}>
              <option value="all">Все</option>
              <option value="active">Действует</option>
              <option value="expired">Истёк</option>
              <option value="none">Без абонемента</option>
            </select>
          </Field>
        </div>
        {hasFilters ? (
          <div className="filters-actions" style={{ marginTop: 10 }}>
            <TextAction onClick={resetFilters}>Сбросить фильтры</TextAction>
          </div>
        ) : null}
      </FiltersBar>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h3>Список</h3>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="muted">
              {rows.length}{" "}
              {rows.length === 1
                ? "ученик"
                : rows.length > 1 && rows.length < 5
                  ? "ученика"
                  : "учеников"}
            </span>
            <Button
              type="button"
              className="secondary compact"
              busy={exporting}
              disabled={!rows.length}
              onClick={exportExcel}
            >
              Excel
            </Button>
          </div>
        </div>
        <DataTable
          rows={rows}
          empty={
            hasFilters
              ? "Ничего не найдено — сбросьте фильтры"
              : "Учеников пока нет"
          }
          onRowClick={setSelected}
          columns={[
            {
              key: "full_name",
              title: "Ученик",
              render: (row) => (
                <div className="center-cell">
                  <strong>{row.full_name}</strong>
                  <span>{row.email || row.phone || "без контакта"}</span>
                </div>
              ),
            },
            {
              key: "tenant_name",
              title: "Центр",
              render: (row) => row.tenant_name || "—",
            },
            {
              key: "phone",
              title: "Телефон",
              render: (row) => row.phone || "—",
            },
            {
              key: "status",
              title: "Статус",
              render: (row) => (
                <Badge
                  value={row.status}
                  label={STUDENT_STATUS_LABELS[row.status] || row.status}
                />
              ),
            },
            {
              key: "subscription",
              title: "Абонемент",
              render: (row) => {
                const active = activeSubscription(row);
                if (active) {
                  return (
                    <div className="center-cell">
                      <strong>{active.plan_name}</strong>
                      <span>до {formatDate(active.ends_on)}</span>
                    </div>
                  );
                }
                if (row.subscription_count) {
                  return (
                    <div className="center-cell">
                      <strong>Нет активного</strong>
                      <span>{row.subscription_count} в истории</span>
                    </div>
                  );
                }
                return "—";
              },
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
                    onClick={() => setSelected(row)}
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

      {selected ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка ученика">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setSelected(null)}
          />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Ученик</div>
                <h2>{selected.full_name}</h2>
                <p className="muted">{selected.tenant_name}</p>
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
                  value={selected.status}
                  label={STUDENT_STATUS_LABELS[selected.status] || selected.status}
                />
                <span className="status">
                  {selected.active_subscription_count
                    ? `${selected.active_subscription_count} активн. абонемент`
                    : "без активного абонемента"}
                </span>
              </div>

              <div className="detail-quick">
                <div>
                  <span>Телефон</span>
                  <strong>{selected.phone || "—"}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{selected.email || "—"}</strong>
                </div>
                <div>
                  <span>Действует до</span>
                  <strong>{formatDate(selected.active_until)}</strong>
                </div>
              </div>

              <section className="detail-section">
                <h3>Центр</h3>
                <dl className="detail-list">
                  <DetailRow label="Название">{selected.tenant_name}</DetailRow>
                  <DetailRow label="Абонементы">
                    {selected.active_subscription_count} активн. / {selected.subscription_count} всего
                  </DetailRow>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Абонементы</h3>
                {(selected.subscriptions || []).length ? (
                  <ul className="doc-list">
                    {selected.subscriptions.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.plan_name}</strong>
                          <span>
                            {subStatusLabel[item.status] || item.status} ·{" "}
                            {formatDate(item.starts_on)} — {formatDate(item.ends_on)}
                            {item.total_lessons != null
                              ? ` · ${item.remaining_lessons ?? 0}/${item.total_lessons} уроков`
                              : ""}
                          </span>
                        </div>
                        <Badge
                          value={item.status}
                          label={subStatusLabel[item.status] || item.status}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Абонементов нет</p>
                )}
              </section>
            </div>

            <div className="sheet-foot detail-foot">
              <div className="detail-foot-main">
                <Button type="button" onClick={() => openCenter(selected)}>
                  Открыть кабинет центра
                </Button>
                <Button type="button" className="secondary" onClick={() => setSelected(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
