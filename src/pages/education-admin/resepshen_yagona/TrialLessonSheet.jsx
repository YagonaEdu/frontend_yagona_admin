import { Button, Field } from "@/components/ui";
import { formatUzPhone, today } from "@/utils/format";
import PersonSearchField from "./PersonSearchField";
import { staffLabel } from "./utils";

export default function TrialLessonSheet({
  open,
  form,
  setForm,
  person,
  onPersonChange,
  peopleOptions = [],
  courses,
  groups,
  staff,
  rooms,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  const courseGroups = groups.filter(
    (g) => !form.course || String(g.course) === String(form.course),
  );

  const selectedLabel = person?.full_name
    ? `${person.full_name}${person.phone ? ` · ${formatUzPhone(person.phone)}` : ""}`
    : "";

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Пробный урок">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Записать на пробный урок</h2>
            <p className="muted">
              {selectedLabel || "Выберите, кого записываем"}
            </p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="sheet-body" onSubmit={onSubmit}>
          {error ? <p className="field-message error">{error}</p> : null}
          <div className="form-grid">
            <Field label="Кого записываем *">
              <PersonSearchField
                person={person}
                options={peopleOptions}
                onChange={onPersonChange}
                required
                placeholder="Поиск по имени или телефону…"
              />
            </Field>
            <Field label="Курс">
              <select
                value={form.course}
                onChange={(e) =>
                  setForm((p) => ({ ...p, course: e.target.value, group: "" }))
                }
              >
                <option value="">—</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Группа *">
              <select
                value={form.group}
                onChange={(e) => setForm((p) => ({ ...p, group: e.target.value }))}
                required
              >
                <option value="">—</option>
                {courseGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дата *">
              <input
                type="date"
                value={form.date || today()}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                required
              />
            </Field>
            <Field label="Начало *">
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                required
              />
            </Field>
            <Field label="Окончание *">
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                required
              />
            </Field>
            <Field label="Преподаватель *">
              <select
                value={form.teacher}
                onChange={(e) => setForm((p) => ({ ...p, teacher: e.target.value }))}
                required
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s._label || staffLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Кабинет *">
              <select
                value={form.room}
                onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))}
                required
              >
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Комментарий">
              <textarea
                rows={2}
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              />
            </Field>
          </div>
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || !person?.full_name}>
              {saving ? "Сохранение…" : "Записать"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
