import { useState } from "react";
import { Button, Field, PhoneInput } from "@/components/ui";
import { api } from "@/services/api/client";
import { today, toApiPhone } from "@/utils/format";
import { digits, staffLabel } from "./utils";

const STEPS = ["Ученик", "Родитель", "Обучение", "Готово"];

export default function QuickStudentSheet({
  open,
  courses,
  groups,
  staff = [],
  students,
  leads,
  onClose,
  onCreated,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    birth_date: "",
    parent_name: "",
    parent_phone: "",
    course: "",
    group: "",
    start_date: today(),
    force: false,
  });
  const [created, setCreated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const courseGroups = groups.filter(
    (g) => !form.course || String(g.course) === String(form.course),
  );

  function findDuplicates() {
    const phoneDigits = digits(form.phone);
    const parentDigits = digits(form.parent_phone);
    const hits = [];
    students.forEach((s) => {
      if (phoneDigits && digits(s.phone) === phoneDigits) {
        hits.push({ kind: "student", id: s.id, full_name: s.full_name, phone: s.phone });
      }
    });
    leads.forEach((l) => {
      if (phoneDigits && digits(l.phone) === phoneDigits) {
        hits.push({ kind: "lead", id: l.id, full_name: l.full_name, phone: l.phone });
      }
    });
    if (parentDigits) {
      students.forEach((s) => {
        const gPhone = s.primary_guardian_phone || s.guardian_phone || "";
        if (digits(gPhone) === parentDigits) {
          hits.push({
            kind: "student",
            id: s.id,
            full_name: s.full_name,
            phone: s.phone,
            extra: "телефон родителя",
          });
        }
      });
    }
    return hits;
  }

  async function submitStudent() {
    setError("");
    const dups = findDuplicates();
    if (dups.length && !form.force && step === 0) {
      setError("Найдены похожие записи. Откройте существующую или отметьте «Продолжить».");
      return;
    }
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    setSaving(true);
    try {
      const student = await api.post("/students", {
        full_name: form.full_name.trim(),
        phone: toApiPhone(form.phone),
        email: form.email.trim(),
        birth_date: form.birth_date || null,
        status: "active",
      });
      if (form.parent_name.trim() && form.parent_phone.trim()) {
        let guardian = null;
        const existing = await api.get(
          `/guardians?search=${encodeURIComponent(toApiPhone(form.parent_phone) || form.parent_phone.trim())}&page_size=20`,
        );
        const list = Array.isArray(existing) ? existing : existing.results || [];
        guardian =
          list.find((g) => digits(g.phone) === digits(form.parent_phone)) ||
          (await api.post("/guardians", {
            full_name: form.parent_name.trim(),
            phone: toApiPhone(form.parent_phone),
          }));
        await api.post("/student-guardians", {
          student: student.id,
          guardian: guardian.id,
          relationship: "parent",
          is_primary: true,
        });
      }
      if (form.group) {
        await api.post("/enrollments", {
          student: student.id,
          group: form.group,
          joined_at: form.start_date || today(),
        });
      }
      setCreated(student);
      setStep(3);
      onCreated?.(student);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dups = step === 0 ? findDuplicates() : [];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Добавить ученика">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Добавить ученика</h2>
            <p className="muted">
              Шаг {Math.min(step + 1, 4)}/{STEPS.length}: {STEPS[Math.min(step, 3)]}
            </p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="sheet-body">
          {error ? <p className="field-message error">{error}</p> : null}
          {step === 0 ? (
            <div className="form-grid">
              {dups.length ? (
                <div className="reception-dup span-2">
                  <strong>Похожий ученик или лид уже существует</strong>
                  <ul>
                    {dups.map((d) => (
                      <li key={`${d.kind}-${d.id}`}>
                        {d.kind === "student" ? "Ученик" : "Лид"}: {d.full_name} · {d.phone}
                      </li>
                    ))}
                  </ul>
                  <label className="reception-force">
                    <input
                      type="checkbox"
                      checked={form.force}
                      onChange={(e) => setForm((p) => ({ ...p, force: e.target.checked }))}
                    />
                    Продолжить
                  </label>
                </div>
              ) : null}
              <Field label="ФИО *" className="span-2">
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Телефон">
                <PhoneInput
                  value={form.phone}
                  onChange={(phone) => setForm((p) => ({ ...p, phone }))}
                />
              </Field>
              <Field label="Email">
                <input
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </Field>
              <Field label="Дата рождения">
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))}
                />
              </Field>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="form-grid">
              <Field label="Имя родителя">
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
            </div>
          ) : null}
          {step === 2 ? (
            <div className="form-grid">
              <Field label="Курс">
                <select
                  value={form.course}
                  onChange={(e) => setForm((p) => ({ ...p, course: e.target.value, group: "" }))}
                >
                  <option value="">—</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Группа">
                <select
                  value={form.group}
                  onChange={(e) => setForm((p) => ({ ...p, group: e.target.value }))}
                >
                  <option value="">—</option>
                  {courseGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              {form.group ? (
                <Field label="Преподаватель группы">
                  <input
                    readOnly
                    value={(() => {
                      const g = groups.find((item) => String(item.id) === String(form.group));
                      if (!g?.teacher) return "Не назначен";
                      const teacher = staff.find((s) => String(s.id) === String(g.teacher));
                      return teacher ? staffLabel(teacher) : "Назначен";
                    })()}
                  />
                </Field>
              ) : null}
              <Field label="Дата начала">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </Field>
            </div>
          ) : null}
          {step === 3 && created ? (
            <div className="reception-success">
              <h3>Ученик создан</h3>
              <p>
                {created.full_name}
                {created.temporary_password
                  ? ` · временный пароль: ${created.temporary_password}`
                  : ""}
              </p>
              <div className="reception-next-actions">
                <Button type="button" onClick={() => onCreated?.(created, "open")}>
                  Открыть ученика
                </Button>
                <Button type="button" variant="ghost" onClick={() => onCreated?.(created, "pay")}>
                  Принять оплату
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCreated(null);
                    setStep(0);
                    setForm({
                      full_name: "",
                      phone: "",
                      email: "",
                      birth_date: "",
                      parent_name: "",
                      parent_phone: "",
                      course: "",
                      group: "",
                      start_date: today(),
                      force: false,
                    });
                  }}
                >
                  Добавить ещё
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        {step < 3 ? (
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Назад
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={saving || !form.full_name.trim()}
              onClick={submitStudent}
            >
              {step < 2 ? "Далее" : saving ? "Сохранение…" : "Создать"}
            </Button>
          </div>
        ) : (
          <div className="sheet-foot">
            <Button type="button" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
