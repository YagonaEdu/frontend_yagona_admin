import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Field } from "@/components/ui";
import { api } from "@/services/api/client";
import { parseBulkVocabulary } from "./materialHelpers";

const EMPTY_WORD = { word: "", translation: "", definition: "", example: "" };

export default function VocabularyFormSheet({
  open,
  vocabulary = null,
  groups = [],
  courses = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({ title: "", description: "", group: "", course: "", topic: "" });
  const [entries, setEntries] = useState([{ ...EMPTY_WORD }]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (vocabulary) {
      setForm({
        title: vocabulary.title || "",
        description: vocabulary.description || "",
        group: vocabulary.group ? String(vocabulary.group) : "",
        course: vocabulary.course ? String(vocabulary.course) : "",
        topic: vocabulary.topic || "",
      });
      setEntries(vocabulary.entries?.length ? vocabulary.entries : [{ ...EMPTY_WORD }]);
    } else {
      setForm({ title: "", description: "", group: "", course: "", topic: "" });
      setEntries([{ ...EMPTY_WORD }]);
    }
    setBulkOpen(false);
    setBulkValue("");
    setBulkPreview([]);
  }, [open, vocabulary]);

  if (!open) return null;

  function updateEntry(index, patch) {
    setEntries((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeEntry(index) {
    setEntries((rows) => rows.filter((_, i) => i !== index));
  }

  function previewBulk() {
    setBulkPreview(parseBulkVocabulary(bulkValue));
  }

  function applyBulk() {
    if (!bulkPreview.length) return;
    setEntries((rows) => {
      const existing = rows.filter((row) => row.word.trim() || row.translation.trim());
      const merged = [...existing];
      bulkPreview.forEach((row) => {
        if (!merged.some((item) => item.word.toLowerCase() === row.word.toLowerCase())) {
          merged.push(row);
        }
      });
      return merged.length ? merged : [{ ...EMPTY_WORD }];
    });
    setBulkOpen(false);
    setBulkValue("");
    setBulkPreview([]);
  }

  async function submit(publish = false) {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        group: form.group || null,
        course: form.course || null,
        entries: entries.filter((row) => row.word.trim() && row.translation.trim()),
      };
      let saved;
      if (vocabulary?.id) {
        saved = await api.patch(`/vocabulary-sets/${vocabulary.id}`, payload);
      } else {
        saved = await api.post("/vocabulary-sets", payload);
      }
      if (publish && saved?.id) {
        await api.post(`/vocabulary-sets/${saved.id}/publish`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer teacher-drawer teacher-drawer-wide tm-form-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ta-create-head">
          <div>
            <h2>{vocabulary ? "Редактировать vocabulary" : "Новый vocabulary"}</h2>
            <p className="tg-muted">{entries.filter((row) => row.word.trim()).length} слов</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="tm-form-body">
          {error ? <Banner>{error}</Banner> : null}
          <Field label="Название *">
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Описание">
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="tm-form-grid">
            <Field label="Группа">
              <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                <option value="">Не выбрана</option>
                {groups.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Курс">
              <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
                <option value="">Не выбран</option>
                {courses.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="tm-vocab-toolbar">
            <strong>Слова</strong>
            <Button variant="ghost" onClick={() => setBulkOpen((v) => !v)}>Вставить списком</Button>
            <Button variant="ghost" onClick={() => setEntries((rows) => [...rows, { ...EMPTY_WORD }])}>+ Добавить слово</Button>
          </div>
          {bulkOpen ? (
            <div className="tm-bulk-box">
              <Field label="Формат: word - перевод или word | перевод">
                <textarea rows={6} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={"apple - яблоко\nbook - книга"} />
              </Field>
              <div className="tm-bulk-actions">
                <Button variant="ghost" onClick={previewBulk}>Предпросмотр</Button>
                <Button onClick={applyBulk} disabled={!bulkPreview.length}>Добавить {bulkPreview.length || ""}</Button>
              </div>
              {bulkPreview.length ? (
                <ul className="tm-bulk-preview">
                  {bulkPreview.slice(0, 8).map((row) => (
                    <li key={`${row.word}-${row.translation}`}>{row.word} — {row.translation}</li>
                  ))}
                  {bulkPreview.length > 8 ? <li className="tg-muted">…ещё {bulkPreview.length - 8}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="tm-vocab-list">
            {entries.map((row, index) => (
              <div key={`word-${index}`} className="tm-vocab-row">
                <span className="tm-vocab-num">{index + 1}</span>
                <input placeholder="Слово *" value={row.word} onChange={(e) => updateEntry(index, { word: e.target.value })} />
                <input placeholder="Перевод *" value={row.translation} onChange={(e) => updateEntry(index, { translation: e.target.value })} />
                <input placeholder="Пример" value={row.example} onChange={(e) => updateEntry(index, { example: e.target.value })} />
                <button type="button" className="tm-icon-btn" onClick={() => removeEntry(index)} aria-label="Удалить">×</button>
              </div>
            ))}
          </div>
        </div>
        <footer className="ta-create-foot">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button variant="ghost" onClick={() => submit(false)} disabled={saving}>Сохранить</Button>
          <Button onClick={() => submit(true)} disabled={saving}>Опубликовать</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
