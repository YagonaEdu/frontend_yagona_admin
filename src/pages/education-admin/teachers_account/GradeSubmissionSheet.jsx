import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Field } from "@/components/ui";
import { formatDate, formatTime } from "@/utils/format";
import { submissionStatusLabel } from "./assignmentHelpers";

export default function GradeSubmissionSheet({
  submission,
  assignment,
  studentName = "",
  onClose,
  onSave,
  onNext,
}) {
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!submission) return;
    setScore(submission.score != null ? String(submission.score) : "");
    setFeedback(submission.teacher_feedback || "");
    setError("");
  }, [submission]);

  useEffect(() => {
    if (!submission) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        save(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [submission, score, feedback]);

  if (!submission) return null;

  async function save(goNext = false) {
    setError("");
    setSaving(true);
    try {
      await onSave(
        {
          score: score === "" ? null : Number(score),
          teacher_feedback: feedback,
        },
        { goNext },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const onTime = submission.status === "submitted";

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer teacher-drawer teacher-drawer-wide ta-grade-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Проверка работы"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ta-grade-head">
          <div>
            <h2>{studentName || "Ученик"}</h2>
            <p className="tg-muted">{assignment?.title}</p>
            {submission.submitted_at ? (
              <p className="tg-muted">
                Сдано: {formatDate(submission.submitted_at)} · {formatTime(submission.submitted_at)}
                {" · "}
                {submissionStatusLabel(submission.status)}
                {onTime ? " вовремя" : submission.status === "late" ? " с опозданием" : ""}
              </p>
            ) : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="ta-grade-layout">
          <section className="ta-grade-work">
            <h3>Ответ ученика</h3>
            {submission.text_answer ? (
              <div className="ta-grade-answer">{submission.text_answer}</div>
            ) : (
              <p className="tg-muted">Текстовый ответ не приложен.</p>
            )}
            {submission.attachment ? (
              <p className="tg-muted">
                <a href={submission.attachment} target="_blank" rel="noreferrer">
                  Открыть вложение
                </a>
              </p>
            ) : null}
          </section>

          <section className="ta-grade-panel">
            {error ? <Banner>{error}</Banner> : null}
            <Field label={`Балл${assignment?.max_score ? ` / ${assignment.max_score}` : ""}`}>
              <input type="number" min="0" value={score} onChange={(e) => setScore(e.target.value)} />
            </Field>
            <Field label="Комментарий преподавателя">
              <textarea
                rows={5}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Хорошая работа. Повтори Present Perfect."
              />
            </Field>
            <div className="ta-grade-actions">
              <Button onClick={() => save(true)} disabled={saving}>
                Сохранить и следующий
              </Button>
              <Button variant="ghost" onClick={() => save(false)} disabled={saving}>
                Сохранить
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
