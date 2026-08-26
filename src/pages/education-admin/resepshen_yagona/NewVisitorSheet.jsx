import { Button, Field, PhoneInput } from "@/components/ui";
import { formatUzPhone } from "@/utils/format";
import { SOURCE_OPTIONS } from "./utils";

export default function NewVisitorSheet({
  open,
  form,
  setForm,
  courses,
  stages,
  duplicates,
  saving,
  error,
  onClose,
  onSubmit,
  onOpenExisting,
}) {
  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Новый посетитель">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Новый посетитель</h2>
            <p className="muted">Быстрая регистрация в CRM · 30–60 секунд</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="sheet-body" onSubmit={onSubmit}>
          {error ? <p className="field-message error">{error}</p> : null}
          {duplicates.length ? (
            <div className="reception-dup">
              <strong>Похожая запись уже есть</strong>
              <ul>
                {duplicates.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <span>
                      {item.kind === "student" ? "Ученик" : "Лид"}: {item.full_name} ·{" "}
                      {item.phone ? formatUzPhone(item.phone) : "—"}
                      {item.extra ? ` · ${item.extra}` : ""}
                    </span>
                    <button type="button" className="text-action" onClick={() => onOpenExisting(item)}>
                      Открыть
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="ФИО *" required>
              <input
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                required
                autoFocus
                placeholder="Имя посетителя"
              />
            </Field>
            <Field label="Телефон *" required>
              <PhoneInput
                value={form.phone}
                onChange={(phone) => setForm((p) => ({ ...p, phone }))}
                required
              />
            </Field>
            <Field label="Имя родителя / опекуна">
              <input
                value={form.parent_name}
                onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))}
              />
            </Field>
            <Field label="Телефон родителя">
              <PhoneInput
                value={form.parent_phone}
                onChange={(phone) => setForm((p) => ({ ...p, parent_phone: phone }))}
              />
            </Field>
            <Field label="Интересующий курс">
              <select
                value={form.course}
                onChange={(e) => setForm((p) => ({ ...p, course: e.target.value }))}
              >
                <option value="">—</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Источник">
              <select
                value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Стадия CRM">
              <select
                value={form.stage}
                onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Комментарий">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Коротко: что интересует"
              />
            </Field>
          </div>
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || (duplicates.length > 0 && !form.force)}>
              {saving ? "Сохранение…" : "Сохранить посетителя"}
            </Button>
            {duplicates.length ? (
              <label className="reception-force">
                <input
                  type="checkbox"
                  checked={Boolean(form.force)}
                  onChange={(e) => setForm((p) => ({ ...p, force: e.target.checked }))}
                />
                Продолжить несмотря на совпадение
              </label>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
