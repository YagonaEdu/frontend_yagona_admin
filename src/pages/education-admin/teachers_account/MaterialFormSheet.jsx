import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Field } from "@/components/ui";
import { api } from "@/services/api/client";
import { formatBytes } from "./materialHelpers";

const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.mp3,.mp4,.mov";

export default function MaterialFormSheet({
  open,
  type = "file",
  material = null,
  groups = [],
  courses = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    group: "",
    course: "",
    link: "",
    text_content: "",
    topic: "",
    level: "",
    author: "",
    status: "draft",
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setFile(null);
    if (material) {
      setForm({
        title: material.title || "",
        description: material.description || "",
        group: material.group ? String(material.group) : "",
        course: material.course ? String(material.course) : "",
        link: material.link || "",
        text_content: material.text_content || "",
        topic: material.topic || "",
        level: material.level || "",
        author: material.author || "",
        status: material.status || "draft",
      });
    } else {
      setForm({
        title: "",
        description: "",
        group: "",
        course: "",
        link: "",
        text_content: "",
        topic: "",
        level: "",
        author: "",
        status: "draft",
      });
    }
  }, [open, material, type]);

  if (!open) return null;

  async function submit(publish = false) {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        material_type: type,
        group: form.group || null,
        course: form.course || null,
        status: publish ? "published" : form.status || "draft",
      };
      const useMultipart = Boolean(file) || type === "file" || type === "pdf";
      let saved;
      if (useMultipart) {
        const body = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value != null && value !== "") body.append(key, value);
        });
        if (file) body.append("file", file);
        if (material?.id) {
          saved = await api.patch(`/materials/${material.id}`, body);
        } else {
          saved = await api.post("/materials", body);
        }
      } else if (material?.id) {
        saved = await api.patch(`/materials/${material.id}`, payload);
      } else {
        saved = await api.post("/materials", payload);
      }
      if (publish && saved?.id) {
        await api.post(`/materials/${saved.id}/publish`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const titleMap = {
    file: "Файл",
    pdf: "PDF / Книга",
    link: "Ссылка",
    video: "Видео",
    text: "Текстовый материал",
  };

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer teacher-drawer teacher-drawer-wide tm-form-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ta-create-head">
          <div>
            <h2>{material ? "Редактировать" : "Добавить"} — {titleMap[type] || type}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="tm-form-body">
          {error ? <Banner>{error}</Banner> : null}
          <Field label="Название *">
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Описание">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
          <div className="tm-form-grid">
            <Field label="Тема / Unit">
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </Field>
            <Field label="Уровень">
              <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="B1, IELTS..." />
            </Field>
          </div>
          {(type === "file" || type === "pdf") && (
            <Field label="Файл *">
              <div className="ta-upload">
                <input ref={inputRef} type="file" accept={ACCEPT} className="ta-upload-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button type="button" className="ta-upload-empty" onClick={() => inputRef.current?.click()}>
                  <span className="ta-upload-icon">↑</span>
                  <span>{file ? file.name : material?.file ? "Заменить файл" : "Выберите файл"}</span>
                  {file ? <span className="tg-muted">{formatBytes(file.size)}</span> : null}
                </button>
              </div>
            </Field>
          )}
          {(type === "link" || type === "video") && (
            <Field label="URL *">
              <input required type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://..." />
            </Field>
          )}
          {type === "text" && (
            <Field label="Текст *">
              <textarea rows={8} value={form.text_content} onChange={(e) => setForm({ ...form, text_content: e.target.value })} />
            </Field>
          )}
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
