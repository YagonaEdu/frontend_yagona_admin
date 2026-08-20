import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { results } from "@/utils/format";

export default function CrmPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", source: "manual", stage: "" });

  async function load() {
    setError("");
    try {
      const [leadData, stageData] = await Promise.all([
        api.get("/leads?page_size=100"),
        api.get("/lead-stages?page_size=100"),
      ]);
      const stageList = results(stageData);
      setLeads(results(leadData));
      setStages(stageList);
      setForm((prev) => ({ ...prev, stage: prev.stage || stageList[0]?.id || "" }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/leads", form);
      setForm((prev) => ({ ...prev, full_name: "", phone: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="CRM" subtitle="Лиды и воронка учебного центра." />
      <Banner>{error}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Новый лид</h3>
          <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
            <Field label="ФИО">
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Телефон">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </Field>
            <Field label="Стадия">
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {stages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button type="submit" className="mt-12">
            Сохранить
          </Button>
        </form>
      ) : null}
      <div className="card">
        <DataTable
          rows={leads}
          empty="Лидов пока нет"
          columns={[
            { key: "full_name", title: "Имя" },
            { key: "phone", title: "Телефон" },
            { key: "source", title: "Источник" },
            {
              key: "stage",
              title: "Стадия",
              render: (row) => stages.find((s) => s.id === row.stage)?.name || "—",
            },
            {
              key: "status",
              title: "Статус",
              render: (row) => <Badge value={row.status || "active"} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
