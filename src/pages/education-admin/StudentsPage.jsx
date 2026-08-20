import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader, TextAction } from "@/components/ui";
import { STUDENT_STATUS_LABELS } from "@/constants";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { results } from "@/utils/format";

const emptyForm = { full_name: "", phone: "", email: "", status: "active", notes: "" };

export default function StudentsPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setError("");
    try {
      setStudents(results(await api.get("/students?page_size=100")));
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
    setInfo("");
    try {
      const created = await api.post("/students", form);
      setForm(emptyForm);
      setInfo(
        created.temporary_password
          ? `Временный пароль: ${created.temporary_password}`
          : "Студент сохранён.",
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetTemporary(student) {
    setError("");
    setInfo("");
    try {
      const updated = await api.patch(`/students/${student.id}`, { reset_temporary: true });
      setInfo(
        updated.temporary_password
          ? `Временный пароль: ${updated.temporary_password}`
          : "Пароль сброшен.",
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ученики"
        subtitle="Временный пароль ученика: номер телефона + название центра."
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Новый студент</h3>
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
            <Field label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" className="mt-12">
            Сохранить
          </Button>
        </form>
      ) : null}
      <div className="card">
        <DataTable
          rows={students}
          empty="Студентов пока нет"
          columns={[
            { key: "full_name", title: "ФИО" },
            { key: "phone", title: "Телефон" },
            { key: "email", title: "Email" },
            {
              key: "status",
              title: "Статус",
              render: (row) => (
                <Badge value={row.status} label={STUDENT_STATUS_LABELS[row.status] || row.status} />
              ),
            },
            {
              key: "actions",
              title: "",
              render: (row) =>
                canWrite ? (
                  <TextAction onClick={() => resetTemporary(row)}>Сброс пароля</TextAction>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}
