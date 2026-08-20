import { useEffect, useState } from "react";
import { Banner, Badge, DataTable, PageHeader, StatCard, TextAction } from "@/components/ui";
import { CYCLE_LABELS, LICENSE_LABELS, PLAN_LABELS } from "@/constants";
import { listPlatformTenants, patchPlatformTenant } from "@/services/tenant";
import { addDays, formatDate, money } from "@/utils/format";

export default function LicensesPage() {
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setTenants(await listPlatformTenants());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function extend(row) {
    setError("");
    try {
      await patchPlatformTenant(row.id, {
        licensed_until: addDays(row.licensed_until, 30),
        is_active: true,
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const paid = tenants.filter((row) => row.license_status === "active").length;
  const trial = tenants.filter((row) => row.license_status === "trial").length;
  const expired = tenants.filter((row) => row.license_status === "expired").length;

  return (
    <div>
      <PageHeader
        title="Лицензии и тарифы"
        subtitle="Состояние подписки клиентов на CRM и приложение Yagona."
      />
      <Banner>{error}</Banner>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Оплачено" value={paid} />
        <StatCard label="Пробный" value={trial} />
        <StatCard label="Истекло" value={expired} />
        <StatCard
          label="MRR"
          value={money(tenants.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0))}
        />
      </div>
      <div className="card">
        <DataTable
          rows={tenants}
          empty="Нет данных"
          columns={[
            { key: "name", title: "Центр" },
            {
              key: "plan",
              title: "Тариф",
              render: (row) => PLAN_LABELS[row.plan] || row.plan,
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
              key: "licensed_from",
              title: "С",
              render: (row) => formatDate(row.licensed_from),
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
              render: (row) => <TextAction onClick={() => extend(row)}>+30 дней</TextAction>,
            },
          ]}
        />
      </div>
    </div>
  );
}
