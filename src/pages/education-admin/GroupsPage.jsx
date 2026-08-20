import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { results, today } from "@/utils/format";

export default function GroupsPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    course: "",
    teacher: "",
    capacity: 10,
    start_date: today(),
    status: "active",
  });

  async function load() {
    setError("");
    try {
      const [groupData, courseData, staffData] = await Promise.all([
        api.get("/groups?page_size=100"),
        api.get("/courses?page_size=100"),
        api.get("/staff?page_size=100"),
      ]);
      const courseList = results(courseData);
      const staffList = results(staffData).filter((item) => item.role === "teacher");
      setGroups(results(groupData));
      setCourses(courseList);
      setStaff(staffList);
      setForm((prev) => ({
        ...prev,
        course: prev.course || courseList[0]?.id || "",
        teacher: prev.teacher || staffList[0]?.id || "",
      }));
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
      await api.post("/groups", form);
      setForm((prev) => ({ ...prev, name: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Группы" subtitle="Группы, курсы и преподаватели." />
      <Banner>{error}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Новая группа</h3>
          <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Название">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Курс">
              <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Преподаватель">
              <select
                value={form.teacher}
                onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              >
                {staff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.user?.name || item.user?.email || item.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Вместимость">
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
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
          rows={groups}
          empty="Групп пока нет"
          columns={[
            { key: "name", title: "Группа" },
            {
              key: "course",
              title: "Курс",
              render: (row) => courses.find((c) => c.id === row.course)?.name || "—",
            },
            {
              key: "capacity",
              title: "Места",
              render: (row) => `${row.active_students ?? 0} / ${row.capacity}`,
            },
            {
              key: "status",
              title: "Статус",
              render: (row) => <Badge value={row.status} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
