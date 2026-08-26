import { useEffect, useMemo, useState } from "react";
import { Button, Field } from "@/components/ui";
import { api } from "@/services/api/client";
import { formatTime, results } from "@/utils/format";
import { isSameLocalDay } from "./utils";

export default function MarkArrivalSheet({
  open,
  student,
  lessons,
  groups,
  enrollments,
  onClose,
  onSaved,
}) {
  const [lessonId, setLessonId] = useState("");
  const [status, setStatus] = useState("present");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const studentGroupIds = useMemo(() => {
    if (!student) return new Set();
    return new Set(
      enrollments
        .filter((e) => String(e.student) === String(student.id) && e.status === "active")
        .map((e) => String(e.group)),
    );
  }, [enrollments, student]);

  const candidates = useMemo(() => {
    return lessons
      .filter((l) => isSameLocalDay(l.starts_at) && l.status !== "cancelled")
      .filter((l) => studentGroupIds.has(String(l.group)))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [lessons, studentGroupIds]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStatus("present");
    setLessonId(candidates[0]?.id ? String(candidates[0].id) : "");
  }, [open, candidates]);

  if (!open || !student) return null;

  const groupName = (id) => groups.find((g) => String(g.id) === String(id))?.name || "—";

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!lessonId) {
      setError("Нет занятия на сегодня для групп ученика.");
      return;
    }
    setSaving(true);
    try {
      const existing = await api.get(`/lessons/${lessonId}/attendance`);
      const list = Array.isArray(existing) ? existing : results(existing);
      const others = list
        .filter((row) => String(row.student) !== String(student.id))
        .map((row) => ({
          student: row.student,
          status: row.status,
          comment: row.comment || "",
        }));
      await api.put(`/lessons/${lessonId}/attendance`, {
        entries: [
          ...others,
          { student: student.id, status, comment: status === "present" ? "Ресепшн" : "" },
        ],
      });
      onSaved?.("Приход отмечен");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Отметить приход">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Отметить приход</h2>
            <p className="muted">{student.full_name}</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="sheet-body" onSubmit={submit}>
          {error ? <p className="field-message error">{error}</p> : null}
          {!candidates.length ? (
            <p className="muted">Сегодня нет занятий для групп этого ученика.</p>
          ) : (
            <>
              <Field label="Занятие">
                <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} required>
                  {candidates.map((l) => (
                    <option key={l.id} value={l.id}>
                      {formatTime(l.starts_at)} · {groupName(l.group)} · {l.topic || "занятие"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Статус">
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="present">Пришёл</option>
                  <option value="late">Опоздал</option>
                  <option value="absent">Не пришёл</option>
                  <option value="excused">Уважительная</option>
                </select>
              </Field>
            </>
          )}
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || !candidates.length}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
