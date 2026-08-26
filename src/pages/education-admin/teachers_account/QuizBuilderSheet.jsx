import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Field } from "@/components/ui";
import { api } from "@/services/api/client";
import { emptyQuestion, QUESTION_TYPES, validateQuizDraft } from "./materialHelpers";

export default function QuizBuilderSheet({
  open,
  quiz = null,
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
    passing_score: "",
    attempt_limit: "",
    shuffle_questions: false,
    shuffle_answers: false,
    show_results: "score_mistakes",
  });
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setErrors([]);
    setPreview(false);
    if (quiz) {
      setForm({
        title: quiz.title || "",
        description: quiz.description || "",
        group: quiz.group ? String(quiz.group) : "",
        course: quiz.course ? String(quiz.course) : "",
        passing_score: quiz.passing_score != null ? String(quiz.passing_score) : "",
        attempt_limit: quiz.attempt_limit != null ? String(quiz.attempt_limit) : "",
        shuffle_questions: Boolean(quiz.shuffle_questions),
        shuffle_answers: Boolean(quiz.shuffle_answers),
        show_results: quiz.show_results || "score_mistakes",
      });
      setQuestions(quiz.questions?.length ? quiz.questions : [emptyQuestion()]);
    } else {
      setForm({
        title: "",
        description: "",
        group: "",
        course: "",
        passing_score: "",
        attempt_limit: "",
        shuffle_questions: false,
        shuffle_answers: false,
        show_results: "score_mistakes",
      });
      setQuestions([emptyQuestion()]);
    }
  }, [open, quiz]);

  if (!open) return null;

  function updateQuestion(index, patch) {
    setQuestions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function changeQuestionType(index, question_type) {
    setQuestions((rows) => rows.map((row, i) => (i === index ? emptyQuestion(question_type) : row)));
  }

  function updateOption(qIndex, oIndex, patch) {
    setQuestions((rows) =>
      rows.map((row, i) => {
        if (i !== qIndex) return row;
        const options = row.options.map((opt, j) => (j === oIndex ? { ...opt, ...patch } : opt));
        if (patch.is_correct && row.question_type === "single") {
          return {
            ...row,
            options: options.map((opt, j) => ({ ...opt, is_correct: j === oIndex })),
          };
        }
        return { ...row, options };
      }),
    );
  }

  async function submit(publish = false) {
    const validation = validateQuizDraft(questions);
    if (!form.title.trim()) validation.unshift("Укажите название теста.");
    setErrors(validation);
    if (validation.length) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        group: form.group || null,
        course: form.course || null,
        passing_score: form.passing_score ? Number(form.passing_score) : null,
        attempt_limit: form.attempt_limit ? Number(form.attempt_limit) : null,
        questions: questions.map((row, index) => ({
          ...row,
          position: index,
          points: Number(row.points) || 1,
          accepted_answers: (row.accepted_answers || []).filter((item) => item.text?.trim()),
        })),
      };
      let saved;
      if (quiz?.id) {
        saved = await api.patch(`/quizzes/${quiz.id}`, payload);
      } else {
        saved = await api.post("/quizzes", payload);
      }
      if (publish && saved?.id) {
        await api.post(`/quizzes/${saved.id}/publish`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openPreview() {
    if (!quiz?.id) {
      setErrors(["Сначала сохраните тест, затем откройте предпросмотр."]);
      return;
    }
    setPreview(true);
  }

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer teacher-drawer teacher-drawer-wide tm-form-drawer tm-quiz-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ta-create-head">
          <div>
            <h2>{quiz ? "Редактировать тест" : "Новый тест"}</h2>
            <p className="tg-muted">{questions.length} вопросов</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="tm-form-body">
          {error ? <Banner>{error}</Banner> : null}
          {errors.length ? (
            <Banner>
              {errors.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </Banner>
          ) : null}
          <Field label="Название *">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
            <Field label="Проходной балл">
              <input type="number" min="0" value={form.passing_score} onChange={(e) => setForm({ ...form, passing_score: e.target.value })} />
            </Field>
          </div>
          <div className="tm-form-grid">
            <Field label="Попытки">
              <input type="number" min="1" placeholder="Без ограничений" value={form.attempt_limit} onChange={(e) => setForm({ ...form, attempt_limit: e.target.value })} />
            </Field>
            <Field label="Показ результатов">
              <select value={form.show_results} onChange={(e) => setForm({ ...form, show_results: e.target.value })}>
                <option value="score">Только балл</option>
                <option value="score_mistakes">Балл и ошибки</option>
                <option value="all">Все правильные ответы</option>
              </select>
            </Field>
          </div>
          <label className="tm-check">
            <input type="checkbox" checked={form.shuffle_questions} onChange={(e) => setForm({ ...form, shuffle_questions: e.target.checked })} />
            Перемешивать вопросы
          </label>
          <label className="tm-check">
            <input type="checkbox" checked={form.shuffle_answers} onChange={(e) => setForm({ ...form, shuffle_answers: e.target.checked })} />
            Перемешивать ответы
          </label>

          <div className="tm-quiz-questions">
            {questions.map((question, qIndex) => (
              <article key={`q-${qIndex}`} className="tm-question-card">
                <header className="tm-question-head">
                  <strong>Вопрос {qIndex + 1}</strong>
                  <select value={question.question_type} onChange={(e) => changeQuestionType(qIndex, e.target.value)}>
                    {QUESTION_TYPES.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                  <div className="tm-question-actions">
                    <button type="button" className="tm-icon-btn" onClick={() => setQuestions((rows) => { const copy = [...rows]; copy.splice(qIndex + 1, 0, { ...question, options: question.options?.map((o) => ({ ...o })) }); return copy; })} aria-label="Дублировать">⧉</button>
                    <button type="button" className="tm-icon-btn" onClick={() => setQuestions((rows) => rows.filter((_, i) => i !== qIndex))} aria-label="Удалить">×</button>
                  </div>
                </header>
                <Field label="Текст вопроса">
                  <textarea rows={2} value={question.text} onChange={(e) => updateQuestion(qIndex, { text: e.target.value })} />
                </Field>
                <Field label="Баллы">
                  <input type="number" min="1" value={question.points} onChange={(e) => updateQuestion(qIndex, { points: e.target.value })} />
                </Field>
                {question.question_type === "short_text" ? (
                  <Field label="Принимаемые ответы">
                    {(question.accepted_answers || [{ text: "" }]).map((row, aIndex) => (
                      <input
                        key={`acc-${qIndex}-${aIndex}`}
                        value={row.text}
                        placeholder="достижение"
                        onChange={(e) => {
                          const accepted = [...(question.accepted_answers || [{ text: "" }])];
                          accepted[aIndex] = { text: e.target.value };
                          updateQuestion(qIndex, { accepted_answers: accepted });
                        }}
                      />
                    ))}
                    <Button variant="ghost" onClick={() => updateQuestion(qIndex, { accepted_answers: [...(question.accepted_answers || []), { text: "" }] })}>+ Ответ</Button>
                  </Field>
                ) : (
                  <div className="tm-options">
                    {(question.options || []).map((option, oIndex) => (
                      <label key={`opt-${qIndex}-${oIndex}`} className="tm-option-row">
                        <input
                          type={question.question_type === "multiple" ? "checkbox" : "radio"}
                          name={`q-${qIndex}`}
                          checked={Boolean(option.is_correct)}
                          onChange={(e) => updateOption(qIndex, oIndex, { is_correct: e.target.checked })}
                        />
                        <input value={option.text} onChange={(e) => updateOption(qIndex, oIndex, { text: e.target.value })} placeholder={`Вариант ${oIndex + 1}`} />
                      </label>
                    ))}
                    <Button variant="ghost" onClick={() => updateQuestion(qIndex, { options: [...(question.options || []), { text: "", is_correct: false }] })}>+ Добавить вариант</Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setQuestions((rows) => [...rows, emptyQuestion()])}>+ Добавить вопрос</Button>
          {preview && quiz?.id ? (
            <div className="tm-preview-box">
              <strong>Предпросмотр сохранён</strong>
              <p className="tg-muted">Студент увидит вопросы без правильных ответов.</p>
            </div>
          ) : null}
        </div>
        <footer className="ta-create-foot">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button variant="ghost" onClick={openPreview} disabled={saving || !quiz?.id}>Предпросмотр</Button>
          <Button variant="ghost" onClick={() => submit(false)} disabled={saving}>Сохранить</Button>
          <Button onClick={() => submit(true)} disabled={saving}>Опубликовать</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
