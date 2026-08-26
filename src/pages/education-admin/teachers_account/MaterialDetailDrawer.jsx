import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button } from "@/components/ui";
import { api } from "@/services/api/client";
import { formatCreated, materialKindLabel, statusLabel, statusTone } from "./materialHelpers";

export default function MaterialDetailDrawer({
  item,
  groupMap,
  courseMap,
  onClose,
  onEdit,
  onResults,
  onDuplicate,
  onArchive,
}) {
  const [quizResults, setQuizResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item || item.kind !== "quiz") {
      setQuizResults(null);
      return;
    }
    let cancelled = false;
    setLoadingResults(true);
    api.get(`/quizzes/${item.id}/results`)
      .then((data) => {
        if (!cancelled) setQuizResults(data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingResults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const groupName = groupMap.get(String(item.group)) || "—";
  const courseName = courseMap.get(String(item.course)) || "—";

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer teacher-drawer tm-detail-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ta-detail-head">
          <div>
            <p className="tm-detail-type">{materialKindLabel(item.kind)}</p>
            <h2>{item.title}</h2>
            <p className="tg-muted">{groupName} · {courseName}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="tm-detail-body">
          {error ? <Banner>{error}</Banner> : null}
          <div className="tm-detail-meta">
            <span className={`tg-pill tg-pill-${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
            <span className="tg-muted">Добавлено {formatCreated(item.created_at)}</span>
          </div>
          {item.description ? <p>{item.description}</p> : null}
          <p className="tg-muted">{item.meta}</p>
          {item.link ? (
            <a href={item.link} target="_blank" rel="noreferrer" className="text-link">Открыть ссылку</a>
          ) : null}
          {item.file ? (
            <a href={item.file} target="_blank" rel="noreferrer" className="text-link">Открыть файл</a>
          ) : null}
          {item.kind === "quiz" ? (
            <section className="tm-results-section">
              <h3>Результаты</h3>
              {loadingResults ? <p className="tg-muted">Загрузка…</p> : null}
              {quizResults ? (
                <>
                  <div className="tm-results-kpis">
                    <div>
                      <span className="tg-muted">Участников</span>
                      <strong>
                        {quizResults.participants}
                        {quizResults.enrolled ? ` / ${quizResults.enrolled}` : ""}
                      </strong>
                    </div>
                    <div>
                      <span className="tg-muted">Средний балл</span>
                      <strong>
                        {quizResults.average_score != null ? `${quizResults.average_score}%` : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="tg-muted">Сдали</span>
                      <strong className="tr-score-good">{quizResults.passed ?? 0}</strong>
                    </div>
                    <div>
                      <span className="tg-muted">Не прошли</span>
                      <strong className="tr-score-low">{quizResults.failed ?? 0}</strong>
                    </div>
                    <div>
                      <span className="tg-muted">Не начали</span>
                      <strong>{quizResults.not_started ?? 0}</strong>
                    </div>
                  </div>
                  {quizResults.attempts?.length ? (
                    <div className="tm-attempts-table-wrap">
                      <table className="tg-table tm-attempts-table">
                        <thead>
                          <tr>
                            <th>Ученик</th>
                            <th>Балл</th>
                            <th>Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quizResults.attempts.slice(0, 12).map((row) => {
                            const passed =
                              quizResults.passing_score == null
                                ? null
                                : Number(row.score || 0) >= Number(quizResults.passing_score);
                            const pct =
                              row.max_score > 0
                                ? Math.round((Number(row.score || 0) / Number(row.max_score)) * 100)
                                : null;
                            return (
                              <tr key={row.id}>
                                <td>{row.student_name}</td>
                                <td>
                                  {row.score != null ? `${row.score} / ${row.max_score}` : "—"}
                                  {pct != null ? ` (${pct}%)` : ""}
                                </td>
                                <td>
                                  {passed == null ? (
                                    <span className="tg-muted">Сдан</span>
                                  ) : passed ? (
                                    <span className="tg-pill tg-pill-green">Сдал</span>
                                  ) : (
                                    <span className="tg-pill tg-pill-red">Не прошёл</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {quizResults.question_stats?.length ? (
                    <ul className="tm-question-stats">
                      {quizResults.question_stats.map((row) => (
                        <li key={row.question_id}>
                          <span>Q{row.position + 1}</span>
                          <span className="tg-muted">{row.text}</span>
                          <strong>{row.correct_pct}%</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
        </div>
        <footer className="ta-create-foot">
          <Button variant="ghost" onClick={() => onEdit?.(item)}>Редактировать</Button>
          {item.kind === "quiz" ? (
            <Button variant="ghost" onClick={() => onResults?.(item)}>Результаты</Button>
          ) : null}
          <Button variant="ghost" onClick={() => onDuplicate?.(item)}>Дублировать</Button>
          <Button variant="ghost" onClick={() => onArchive?.(item)}>Архивировать</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
