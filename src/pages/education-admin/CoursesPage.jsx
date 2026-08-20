import { useEffect, useState } from "react";
import { Banner, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { results } from "@/utils/format";

export default function CoursesPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", description: "" });

  async function load() {
    setError("");
    try {
      setCourses(results(await api.get("/courses?page_size=100")));
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
      await api.post("/courses", form);
      setForm({ name: "", description: "" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Курсы" subtitle="Курсы учебного центра." />
      <Banner>{error}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Новый курс</h3>
          <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Название">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Описание">
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <Button type="submit" className="mt-12">
            Сохранить
          </Button>
        </form>
      ) : null}
      <div className="card">
        <DataTable
          rows={courses}
          empty="Курсов пока нет"
          columns={[
            { key: "name", title: "Курс" },
            { key: "description", title: "Описание" },
          ]}
        />
      </div>
    </div>
  );
}
