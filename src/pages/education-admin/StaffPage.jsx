import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/constants";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { results } from "@/utils/format";

export default function StaffPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    phone: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "teacher",
  });

  async function load() {
    setError("");
    try {
      setStaff(results(await api.get("/staff?page_size=100")));
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
      await api.post("/staff", form);
      setForm({
        email: "",
        phone: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "teacher",
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Команда" subtitle="Сотрудники учебного центра." />
      <Banner>{error}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Добавить сотрудника</h3>
          <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Телефон">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Имя">
              <input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </Field>
            <Field label="Фамилия">
              <input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </Field>
            <Field label="Роль">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">admin</option>
                <option value="teacher">teacher</option>
                <option value="accountant">accountant</option>
              </select>
            </Field>
            <Field label="Пароль">
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
              />
            </Field>
          </div>
          <Button type="submit" className="mt-12">
            Добавить
          </Button>
        </form>
      ) : null}
      <div className="card">
        <DataTable
          rows={staff}
          empty="Сотрудников нет"
          columns={[
            {
              key: "name",
              title: "Имя",
              render: (row) => row.user?.name || row.user?.email || "—",
            },
            {
              key: "email",
              title: "Email",
              render: (row) => row.user?.email || "—",
            },
            {
              key: "role",
              title: "Роль",
              render: (row) => ROLE_LABELS[row.role] || row.role,
            },
            {
              key: "is_active",
              title: "Статус",
              render: (row) => <Badge value={row.is_active ? "active" : "inactive"} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
