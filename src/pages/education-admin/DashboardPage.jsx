import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, PageHeader, StatCard } from "@/components/ui";
import { api, getSession } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { money } from "@/utils/format";

export default function DashboardPage() {
  const session = getSession();
  const membership = currentMembership(session);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      try {
        setData(await api.get("/dashboard/summary"));
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [session.tenantId]);

  const leads = data?.leads || {};

  return (
    <div>
      <PageHeader
        eyebrow={membership?.tenant_name || "Учебный центр"}
        title="Обзор"
        subtitle="Ключевые показатели за текущий период."
      />
      <Banner>{error}</Banner>

      {data ? (
        <section className="section-block">
          <div className="section-head">
            <h3>Показатели</h3>
            <span className="muted">Сегодня и текущий месяц</span>
          </div>
          <div className="grid cols-4">
            <StatCard
              label="Лиды"
              value={leads.total ?? 0}
              hint={`конверсия ${leads.conversion_rate ?? 0}%`}
            />
            <StatCard label="Студенты" value={data.active_students} hint="активные" />
            <StatCard label="Уроки сегодня" value={data.lessons_today} />
            <StatCard
              label="Просрочено"
              value={data.overdue_invoices}
              hint={money(data.overdue_total, data.currency)}
            />
          </div>
        </section>
      ) : null}

      {data ? (
        <div className="grid cols-2">
          <div className="card highlight">
            <div className="stat-label">Сборы за месяц</div>
            <div className="stat">{money(data.collected_this_month, data.currency)}</div>
            <Link className="btn" to="billing" style={{ display: "inline-flex", marginTop: 14 }}>
              К биллингу
            </Link>
          </div>
          <div className="card ornament">
            <div className="section-head" style={{ marginBottom: 4 }}>
              <h3>Воронка CRM</h3>
            </div>
            {(leads.by_stage || []).length ? (
              <div className="grid" style={{ gap: 8, marginTop: 8 }}>
                {leads.by_stage.map((stage) => (
                  <div className="row" key={stage.id} style={{ justifyContent: "space-between" }}>
                    <span>{stage.name}</span>
                    <span className="status">{stage.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Стадий пока нет</div>
            )}
            <Link className="btn secondary" to="crm" style={{ display: "inline-flex", marginTop: 14 }}>
              Открыть CRM
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
