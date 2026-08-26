import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Banner, Button, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { educationSegmentPath } from "@/utils/routes";
import { formatWhen, results } from "@/utils/format";

export default function ReceptionTasksPage() {
  const { tenantSlug = "" } = useParams();
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/leads?page_size=200&ordering=next_follow_up_at");
      setLeads(results(data).filter((l) => !l.converted_student && l.next_follow_up_at));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const { today, overdue, upcoming } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const t = [];
    const o = [];
    const u = [];
    leads.forEach((lead) => {
      const d = new Date(lead.next_follow_up_at);
      if (d < start) o.push(lead);
      else if (d <= end) t.push(lead);
      else u.push(lead);
    });
    return { today: t, overdue: o, upcoming: u.slice(0, 20) };
  }, [leads]);

  async function complete(lead) {
    try {
      await api.post(`/leads/${lead.id}/activities`, {
        kind: "call",
        content: "Задача выполнена",
        occurred_at: new Date().toISOString(),
      });
      await api.patch(`/leads/${lead.id}`, { next_follow_up_at: null });
      setInfo(`Готово: ${lead.full_name}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function Section({ title, items }) {
    return (
      <section className="reception-panel">
        <div className="reception-panel-head">
          <h2>{title}</h2>
          <span className="muted">{items.length}</span>
        </div>
        {!items.length ? (
          <p className="muted">Пусто</p>
        ) : (
          <ul className="reception-list">
            {items.map((lead) => (
              <li key={lead.id}>
                <div>
                  <strong>{lead.full_name}</strong>
                  <p className="muted">
                    {lead.phone || "—"} · {formatWhen(lead.next_follow_up_at)}
                    {lead.source_details ? ` · ${lead.source_details}` : ""}
                  </p>
                </div>
                <div className="reception-row-actions">
                  {lead.phone ? (
                    <a className="button-link" href={`tel:${lead.phone}`}>
                      Позвонить
                    </a>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" onClick={() => complete(lead)}>
                    Готово
                  </Button>
                  <Link
                    className="button-link"
                    to={educationSegmentPath(tenantSlug, "crm")}
                  >
                    CRM
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="reception-page">
      <PageHeader
        title="Задачи"
        subtitle="Follow-up из CRM · звонки и контакты"
        actions={
          <Button type="button" variant="ghost" onClick={load} disabled={loading}>
            Обновить
          </Button>
        }
      />
      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}
      <div className="reception-grid">
        <Section title="Просроченные" items={overdue} />
        <Section title="Сегодня" items={today} />
        <Section title="Скоро" items={upcoming} />
      </div>
    </div>
  );
}
