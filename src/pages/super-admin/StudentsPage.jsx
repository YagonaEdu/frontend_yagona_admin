import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Badge,
  DataTable,
  Field,
  FiltersBar,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { STUDENT_STATUS_LABELS } from "@/constants";
import {
  listPlatformStudents,
  listPlatformTenants,
  platformStudentsSummary,
} from "@/services/tenant";
import { formatDate } from "@/utils/format";

const subStatusLabel = {
  active: "активен",
  expired: "истёк",
  cancelled: "отменён",
};

function planLine(item) {
  const lessons =
    item.total_lessons != null
      ? `${item.remaining_lessons ?? 0} / ${item.total_lessons} уроков`
      : "по дате";
  return `${item.plan_name} · ${subStatusLabel[item.status] || item.status} · ${formatDate(item.starts_on)} — ${formatDate(item.ends_on)} · ${lessons}`;
}

export default function PlatformStudentsPage() {
  const [tenants, setTenants] = useState([]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [tenant, setTenant] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [onlyActiveSub, setOnlyActiveSub] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page_size: "200" });
    if (tenant) params.set("tenant", tenant);
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    if (onlyActiveSub) params.set("has_active_subscription", "true");
    return params.toString();
  }, [tenant, status, search, onlyActiveSub]);

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
        setRows(studentData);
        setSummary(summaryData);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [query, tenant]);

  return (
    <div>
      <PageHeader
        title="База учеников"
        subtitle="Все учебные центры: статус, абонементы и сроки."
      />
      <Banner>{error}</Banner>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Ученики" value={summary?.students ?? "—"} />
        <StatCard label="Активные" value={summary?.active ?? "—"} />
        <StatCard
          label="С абонементом"
          value={summary?.with_active_subscription ?? "—"}
          hint="сейчас действует"
        />
        <StatCard label="Истёк абонемент" value={summary?.expired_subscription ?? "—"} />
      </div>
      <FiltersBar>
        <div className="grid cols-2" style={{ gap: 10 }}>
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
              <option value="">Все</option>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="archived">Архив</option>
            </select>
          </Field>
          <Field label="Поиск">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, телефон, email, центр"
            />
          </Field>
          <label className="field" style={{ justifyContent: "flex-end" }}>
            <span className="field-label">&nbsp;</span>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={onlyActiveSub}
                onChange={(event) => setOnlyActiveSub(event.target.checked)}
              />
              Только с действующим абонементом
            </label>
          </label>
        </div>
      </FiltersBar>
      <div className="card" style={{ marginTop: 16 }}>
        <DataTable
          rows={rows}
          empty="Учеников пока нет"
          columns={[
            { key: "tenant_name", title: "Центр" },
            { key: "full_name", title: "Ученик" },
            { key: "phone", title: "Телефон", render: (row) => row.phone || "—" },
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
              key: "active_subscription_count",
              title: "Абонементы",
              render: (row) =>
                `${row.active_subscription_count} активн. / ${row.subscription_count} всего`,
            },
            {
              key: "active_until",
              title: "Действует до",
              render: (row) => formatDate(row.active_until),
            },
            {
              key: "subscriptions",
              title: "Подключено",
              render: (row) =>
                row.subscriptions?.length ? (
                  <div>
                    {row.subscriptions.map((item) => (
                      <div key={item.id} className="muted">
                        {planLine(item)}
                      </div>
                    ))}
                  </div>
                ) : (
                  "нет"
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}
