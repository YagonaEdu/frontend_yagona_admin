import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { formatWhen, results } from "@/utils/format";

export default function AttendancePage() {
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    async function loadLessons() {
      setError("");
      try {
        const list = results(await api.get("/lessons?page_size=100"));
        setLessons(list);
        setLessonId((prev) => prev || list[0]?.id || "");
      } catch (err) {
        setError(err.message);
      }
    }
    loadLessons();
  }, []);

  useEffect(() => {
    async function loadAttendance() {
      if (!lessonId) return;
      setError("");
      try {
        const data = await api.get(`/lessons/${lessonId}/attendance`);
        setRows(Array.isArray(data) ? data : results(data));
      } catch (err) {
        setError(err.message);
        setRows([]);
      }
    }
    loadAttendance();
  }, [lessonId]);

  async function mark(studentId, status) {
    setError("");
    setInfo("");
    try {
      await api.put(`/lessons/${lessonId}/attendance`, {
        entries: [{ student: studentId, status, comment: "" }],
      });
      setInfo("Посещаемость сохранена.");
      const data = await api.get(`/lessons/${lessonId}/attendance`);
      setRows(Array.isArray(data) ? data : results(data));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Посещаемость" subtitle="Отметки посещаемости по уроку." />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>
      <div className="card" style={{ marginBottom: 16 }}>
        <Field label="Урок">
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            {lessons.map((item) => (
              <option key={item.id} value={item.id}>
                {formatWhen(item.starts_at)} · {item.topic || "урок"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="card">
        <DataTable
          rows={rows}
          empty="Нет записей посещаемости"
          columns={[
            { key: "student_name", title: "Студент", render: (row) => row.student_name || row.student },
            {
              key: "status",
              title: "Статус",
              render: (row) => <Badge value={row.status} />,
            },
            {
              key: "actions",
              title: "",
              render: (row) => (
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="secondary" onClick={() => mark(row.student, "present")}>
                    Present
                  </Button>
                  <Button variant="secondary" onClick={() => mark(row.student, "absent")}>
                    Absent
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
