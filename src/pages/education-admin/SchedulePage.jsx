import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { formatWhen, nowLocalInput, results, toIso } from "@/utils/format";

export default function SchedulePage() {
  const canWrite = currentMembership()?.role !== "teacher";
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    group: "",
    teacher: "",
    room: "",
    starts_at: nowLocalInput(1),
    ends_at: nowLocalInput(2),
    topic: "",
  });

  async function load() {
    setError("");
    try {
      const [lessonData, groupData, staffData, roomData] = await Promise.all([
        api.get("/lessons?page_size=100"),
        api.get("/groups?page_size=100"),
        api.get("/staff?page_size=100"),
        api.get("/rooms?page_size=100"),
      ]);
      const groupList = results(groupData);
      const teachers = results(staffData).filter((item) => item.role === "teacher");
      const roomList = results(roomData);
      setLessons(results(lessonData));
      setGroups(groupList);
      setStaff(teachers);
      setRooms(roomList);
      setForm((prev) => ({
        ...prev,
        group: prev.group || groupList[0]?.id || "",
        teacher: prev.teacher || teachers[0]?.id || "",
        room: prev.room || roomList[0]?.id || "",
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
      await api.post("/lessons", {
        ...form,
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
      });
      setForm((prev) => ({ ...prev, topic: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Расписание" subtitle="Уроки и слоты расписания." />
      <Banner>{error}</Banner>
      {canWrite ? (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <h3>Новый урок</h3>
          <div className="grid cols-2" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Группа">
              <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                {groups.map((item) => (
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
                    {item.user?.name || item.user?.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Комната">
              <select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}>
                {rooms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тема">
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </Field>
            <Field label="Начало">
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </Field>
            <Field label="Конец">
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </Field>
          </div>
          <Button type="submit" className="mt-12">
            Создать урок
          </Button>
        </form>
      ) : null}
      <div className="card">
        <DataTable
          rows={lessons}
          empty="Уроков пока нет"
          columns={[
            {
              key: "starts_at",
              title: "Когда",
              render: (row) => formatWhen(row.starts_at),
            },
            {
              key: "group",
              title: "Группа",
              render: (row) => groups.find((g) => g.id === row.group)?.name || "—",
            },
            { key: "topic", title: "Тема" },
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
