import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { formatDate, formatTime } from "@/utils/format";
import {
  assignmentStatusLabel,
  formatDueLabel,
  pendingReviewCount,
  submissionStatusLabel,
  submissionStatusTone,
} from "./assignmentHelpers";

const DETAIL_TABS = [
  { id: "works", label: "Работы" },
  { id: "missing", label: "Не сдали" },
  { id: "graded", label: "Проверено" },
  { id: "info", label: "Задание" },
];

export default function AssignmentDetailPanel({
  assignment,
  submissions = [],
  groupName = "",
  courseName = "",
  onClose,
  onGrade,
  onRemind,
  onPublish,
  onEdit,
  onCloseAssignment,
  onDuplicate,
  onReviewFirst,
}) {
  const [tab, setTab] = useState("works");

  useEffect(() => {
    setTab("works");
  }, [assignment?.id]);

  useEffect(() => {
    if (!assignment) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [assignment]);

  const summary = useMemo(() => {
    const total = assignment?.total_students || submissions.length;
    const submitted = Number(assignment?.submitted_count || 0);
    const missing = Number(assignment?.missing_count || 0);
    const graded = Number(assignment?.graded_count || 0);
    const pending = pendingReviewCount(assignment || {});
    return { total, submitted, missing, graded, pending };
  }, [assignment, submissions]);

  const filteredSubs = useMemo(() => {
    if (tab === "missing") {
      return submissions.filter((row) => row.status === "not_submitted");
    }
    if (tab === "graded") {
      return submissions.filter((row) => row.status === "graded");
    }
    return submissions;
  }, [submissions, tab]);

  if (!assignment) return null;

  const status = assignmentStatusLabel(assignment);
  const pending = summary.pending;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer teacher-drawer teacher-drawer-wide ta-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={assignment.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ta-detail-head">
          <div>
            <h2>{assignment.title}</h2>
            <p className="tg-muted">
              {groupName}
              {courseName ? ` · ${courseName}` : ""}
            </p>
            <p className="tg-muted">Срок: {formatDueLabel(assignment.due_at)}</p>
            <span className={`tg-pill tg-pill-${statusTone(status.tone)}`}>{status.label}</span>
          </div>
          <div className="ta-detail-head-actions">
            {pending > 0 ? (
              <Button onClick={() => onReviewFirst?.(assignment, submissions)}>Проверить {pending}</Button>
            ) : null}
            {summary.missing > 0 ? (
              <Button variant="ghost" onClick={onRemind}>
                Напомнить
              </Button>
            ) : null}
            {assignment.status === "draft" ? <Button onClick={onPublish}>Опубликовать</Button> : null}
            <div className="ta-menu-wrap">
              <button type="button" className="ta-menu-btn" aria-label="Действия">
                ⋯
              </button>
              <div className="ta-menu">
                <button type="button" onClick={onEdit}>
                  Редактировать
                </button>
                <button type="button" onClick={onDuplicate}>
                  Дублировать
                </button>
                {assignment.status === "published" ? (
                  <button type="button" onClick={onCloseAssignment}>
                    Завершить
                  </button>
                ) : null}
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </header>

        <div className="ta-detail-summary">
          <div>
            <span>Учеников</span>
            <strong>{summary.total}</strong>
          </div>
          <div>
            <span>Сдали</span>
            <strong>{summary.submitted}</strong>
          </div>
          <div>
            <span>На проверку</span>
            <strong>{summary.pending}</strong>
          </div>
          <div>
            <span>Не сдали</span>
            <strong>{summary.missing}</strong>
          </div>
          <div>
            <span>Проверено</span>
            <strong>{summary.graded}</strong>
          </div>
        </div>

        <div className="tg-student-tabs" role="tablist" aria-label="Разделы задания">
          {DETAIL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === "missing" && summary.missing > 0 ? (
                <span className="tg-tab-badge">{summary.missing}</span>
              ) : null}
              {item.id === "works" && summary.pending > 0 ? (
                <span className="tg-tab-badge">{summary.pending}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="ta-detail-body">
          {tab === "info" ? (
            <dl className="tg-kv ta-info-list">
              <div>
                <dt>Название</dt>
                <dd>{assignment.title}</dd>
              </div>
              <div>
                <dt>Описание</dt>
                <dd>{assignment.description || "—"}</dd>
              </div>
              <div>
                <dt>Группа</dt>
                <dd>{groupName || "—"}</dd>
              </div>
              <div>
                <dt>Курс</dt>
                <dd>{courseName || "—"}</dd>
              </div>
              <div>
                <dt>Срок</dt>
                <dd>{formatDueLabel(assignment.due_at)}</dd>
              </div>
              <div>
                <dt>Максимальный балл</dt>
                <dd>{assignment.max_score ?? "—"}</dd>
              </div>
              <div>
                <dt>Ссылка</dt>
                <dd>
                  {assignment.link ? (
                    <a href={assignment.link} target="_blank" rel="noreferrer">
                      {assignment.link}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Файл</dt>
                <dd>
                  {assignment.attachment ? (
                    <a href={assignment.attachment} target="_blank" rel="noreferrer">
                      Открыть вложение
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="tg-table-wrap">
              <table className="tg-table ta-submissions-table">
                <thead>
                  <tr>
                    <th>Ученик</th>
                    <th>Статус</th>
                    <th>Дата сдачи</th>
                    <th>Балл</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.map((row) => (
                    <tr key={row.id} className="tg-row-clickable">
                      <td>{row.studentName || row.student_name || "—"}</td>
                      <td>
                        <span className={`tg-pill tg-pill-${submissionStatusTone(row.status)}`}>
                          {submissionStatusLabel(row.status)}
                        </span>
                      </td>
                      <td>
                        {row.submitted_at ? (
                          <>
                            {formatDate(row.submitted_at)}
                            <span className="ts-cell-sub">{formatTime(row.submitted_at)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.score != null
                          ? `${row.score}${assignment.max_score ? ` / ${assignment.max_score}` : ""}`
                          : "—"}
                      </td>
                      <td>
                        {row.status !== "not_submitted" ? (
                          <Button variant="ghost" onClick={() => onGrade(row)}>
                            {row.status === "graded" ? "Открыть" : "Проверить"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredSubs.length ? (
                <p className="tg-muted ta-empty-inline">
                  {tab === "missing"
                    ? "Все ученики сдали задание"
                    : tab === "graded"
                      ? "Проверенных работ пока нет"
                      : "Пока никто не сдал работу"}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function statusTone(tone) {
  if (tone === "active") return "green";
  if (tone === "today") return "warn";
  if (tone === "overdue") return "warn";
  return "muted";
}
