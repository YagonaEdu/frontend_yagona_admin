import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button } from "@/components/ui";
import { api } from "@/services/api/client";
import { today } from "@/utils/format";

const EMPTY = {
  group: "",
  course: "",
  title: "",
  description: "",
  instructions: "",
  due_date: today(),
  due_time: "18:00",
  max_score: "100",
  link: "",
};

const ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.mp3,.mp4,.mov";

function toForm(assignment) {
  if (!assignment) return { ...EMPTY, due_date: today() };
  const due = assignment.due_at ? new Date(assignment.due_at) : null;
  return {
    group: String(assignment.group || ""),
    course: assignment.course ? String(assignment.course) : "",
    title: assignment.title || "",
    description: assignment.description || "",
    instructions: assignment.instructions || "",
    due_date: due ? due.toISOString().slice(0, 10) : today(),
    due_time: due
      ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
      : "18:00",
    max_score: assignment.max_score != null ? String(assignment.max_score) : "100",
    link: assignment.link || "",
  };
}

function formatBytes(size) {
  if (!size && size !== 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(fileOrName = "") {
  const name = typeof fileOrName === "string" ? fileOrName : fileOrName?.name || "";
  const type = typeof fileOrName === "object" ? fileOrName?.type || "" : "";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image";
  if (type.includes("pdf") || /\.pdf$/i.test(name)) return "pdf";
  if (/\.(mp4|mov|webm)$/i.test(name) || type.startsWith("video/")) return "video";
  return "file";
}

function fileLabel(kind) {
  if (kind === "image") return "Фото";
  if (kind === "pdf") return "PDF";
  if (kind === "video") return "Видео";
  return "Файл";
}

function basename(url = "") {
  try {
    const clean = String(url).split("?")[0];
    return decodeURIComponent(clean.split("/").pop() || "Файл");
  } catch {
    return "Файл";
  }
}

export default function CreateAssignmentSheet({
  open,
  onClose,
  groups = [],
  initialGroup = "",
  lockGroup = false,
  assignment = null,
  duplicateSeed = null,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [removeExisting, setRemoveExisting] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const source = assignment || duplicateSeed;
  const isEdit = Boolean(assignment?.id);
  const existingAttachment = !removeExisting && assignment?.attachment ? assignment.attachment : "";

  useEffect(() => {
    if (!open) return;
    const base = toForm(source);
    setForm({
      ...base,
      group: initialGroup ? String(initialGroup) : base.group,
      due_date: source && !source.due_at && !isEdit ? today() : base.due_date,
    });
    setFile(null);
    setRemoveExisting(false);
    setError("");
  }, [open, source, initialGroup, isEdit]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selectedGroup = useMemo(
    () => groups.find((row) => String(row.id) === String(form.group)),
    [groups, form.group],
  );

  if (!open) return null;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickFile(next) {
    if (!next) return;
    if (next.size > 25 * 1024 * 1024) {
      setError("Файл слишком большой. Максимум 25 МБ.");
      return;
    }
    setError("");
    setFile(next);
    setRemoveExisting(true);
  }

  function clearFile() {
    setFile(null);
    setRemoveExisting(Boolean(assignment?.attachment));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(publish = false) {
    setError("");
    if (!form.group || !form.title.trim()) {
      setError("Укажите группу и название задания.");
      return;
    }
    if (!form.due_date) {
      setError("Укажите срок сдачи.");
      return;
    }
    setSaving(true);
    try {
      const dueAt =
        form.due_date && form.due_time
          ? new Date(`${form.due_date}T${form.due_time}:00`).toISOString()
          : null;
      const group = selectedGroup;
      let saved = assignment;

      if (file) {
        const data = new FormData();
        data.append("group", form.group);
        if (form.course || group?.course) data.append("course", form.course || group.course);
        data.append("title", form.title.trim());
        data.append("description", form.description || "");
        data.append("instructions", form.instructions || "");
        if (dueAt) data.append("due_at", dueAt);
        if (form.max_score !== "") data.append("max_score", String(Number(form.max_score) || 0));
        data.append("link", form.link || "");
        data.append("status", isEdit && assignment?.status !== "draft" ? assignment.status : "draft");
        data.append("attachment", file);

        if (isEdit) {
          saved = await api.patch(`/assignments/${assignment.id}`, data);
        } else {
          saved = await api.post("/assignments", data);
        }
      } else {
        const payload = {
          group: form.group,
          course: form.course || group?.course || null,
          title: form.title.trim(),
          description: form.description,
          instructions: form.instructions,
          due_at: dueAt,
          max_score: form.max_score !== "" ? Number(form.max_score) : null,
          link: form.link || "",
          status: isEdit && assignment?.status !== "draft" ? assignment.status : "draft",
        };
        if (isEdit && removeExisting) {
          payload.attachment = null;
        }
        if (isEdit) {
          saved = await api.patch(`/assignments/${assignment.id}`, payload);
        } else {
          saved = await api.post("/assignments", payload);
        }
      }

      if (publish && saved?.id && (!isEdit || assignment?.status === "draft")) {
        await api.post(`/assignments/${saved.id}/publish`);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const currentKind = file
    ? fileKind(file)
    : existingAttachment
      ? fileKind(basename(existingAttachment))
      : "";

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer teacher-drawer ta-create-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Редактировать задание" : "Создать задание"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ta-create-head">
          <div>
            <p className="ta-create-eyebrow">{isEdit ? "Редактирование" : "Новое задание"}</p>
            <h2>{isEdit ? "Редактировать задание" : "Создать задание"}</h2>
            <p className="tg-muted">Заполните коротко — ученики увидят название, срок и материалы.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="ta-create-body">
          {error ? <Banner>{error}</Banner> : null}

          <section className="ta-form-card">
            <h3>Основное</h3>
            <label className="ta-field">
              <span>Группа *</span>
              <select
                value={form.group}
                disabled={lockGroup || (isEdit && assignment?.status === "published")}
                onChange={(e) => setField("group", e.target.value)}
              >
                <option value="">Выберите группу</option>
                {groups.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ta-field">
              <span>Название *</span>
              <input
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Например: Unit 5 — Vocabulary"
              />
            </label>
            <label className="ta-field">
              <span>Описание</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Кратко, о чём задание"
              />
            </label>
            <label className="ta-field">
              <span>Инструкции</span>
              <textarea
                rows={3}
                value={form.instructions}
                onChange={(e) => setField("instructions", e.target.value)}
                placeholder="Что именно нужно сделать ученику"
              />
            </label>
          </section>

          <section className="ta-form-card">
            <h3>Срок и оценка</h3>
            <div className="ta-field-row">
              <label className="ta-field">
                <span>Дата *</span>
                <input type="date" value={form.due_date} onChange={(e) => setField("due_date", e.target.value)} />
              </label>
              <label className="ta-field">
                <span>Время</span>
                <input type="time" value={form.due_time} onChange={(e) => setField("due_time", e.target.value)} />
              </label>
              <label className="ta-field">
                <span>Макс. балл</span>
                <input
                  type="number"
                  min="0"
                  value={form.max_score}
                  onChange={(e) => setField("max_score", e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="ta-form-card">
            <h3>Материалы</h3>
            <p className="ta-form-hint">Можно прикрепить фото, PDF, Word, Excel или добавить ссылку.</p>

            <div
              className={`ta-upload${dragOver ? " is-drag" : ""}${file || existingAttachment ? " has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const next = e.dataTransfer.files?.[0];
                if (next) pickFile(next);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="ta-upload-input"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />

              {!file && !existingAttachment ? (
                <button type="button" className="ta-upload-empty" onClick={() => fileInputRef.current?.click()}>
                  <span className="ta-upload-icon" aria-hidden="true">
                    ⇪
                  </span>
                  <strong>Перетащите файл сюда</strong>
                  <em>или нажмите, чтобы выбрать фото / документ</em>
                  <span className="ta-upload-types">PNG, JPG, PDF, DOC, XLS, ZIP · до 25 МБ</span>
                </button>
              ) : (
                <div className="ta-upload-preview">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="ta-upload-thumb" />
                  ) : existingAttachment && fileKind(basename(existingAttachment)) === "image" ? (
                    <img src={existingAttachment} alt="" className="ta-upload-thumb" />
                  ) : (
                    <span className={`ta-upload-badge kind-${currentKind}`}>{fileLabel(currentKind)}</span>
                  )}
                  <div className="ta-upload-meta">
                    <strong>{file ? file.name : basename(existingAttachment)}</strong>
                    <span>
                      {file ? formatBytes(file.size) : "Уже прикреплён"}
                      {file ? ` · ${fileLabel(currentKind)}` : ""}
                    </span>
                  </div>
                  <div className="ta-upload-actions">
                    <button type="button" onClick={() => fileInputRef.current?.click()}>
                      Заменить
                    </button>
                    <button type="button" className="is-danger" onClick={clearFile}>
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </div>

            <label className="ta-field">
              <span>Ссылка (необязательно)</span>
              <input
                value={form.link}
                onChange={(e) => setField("link", e.target.value)}
                placeholder="https://docs.google.com/..."
              />
            </label>
          </section>
        </div>

        <footer className="ta-create-foot">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <div className="ta-create-foot-main">
            {!isEdit || assignment?.status === "draft" ? (
              <Button variant="ghost" onClick={() => submit(false)} disabled={saving}>
                Черновик
              </Button>
            ) : null}
            <Button onClick={() => submit(!isEdit || assignment?.status === "draft")} disabled={saving}>
              {isEdit && assignment?.status !== "draft" ? "Сохранить" : "Опубликовать"}
            </Button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
