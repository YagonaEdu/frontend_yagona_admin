import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/utils/format";
import {
  avatarColor,
  buildStudentAttendanceStats,
  getAttendanceTone,
  studentInitials,
} from "./groupHelpers";
import {
  averageScore,
  formatGradedWhen,
  formatScoreLabel,
  scoreTone,
} from "./resultHelpers";
import { ASSIGNMENT_STATUS_LABELS } from "./utils";

const TABS = [
  { id: "overview", label: "Обзор" },
  { id: "assignments", label: "Задания" },
  { id: "trend", label: "Динамика" },
  { id: "attendance", label: "Посещаемость" },
];

const ATT_LABELS = {
  present: "Присутствовал",
  late: "Опоздал",
  absent: "Отсутствовал",
  excused: "Уважительная",
};

export default function StudentResultDrawer({
  student,
  onClose,
  assignments = [],
  submissions = [],
  lessons = [],
  attendanceByLesson = {},
  onOpenSubmission,
}) {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    setTab("overview");
  }, [student?.id]);

  useEffect(() => {
    if (!student) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [student]);

  const graded = useMemo(
    () =>
      submissions
        .filter((row) => row.status === "graded" && row.score != null)
        .map((row) => {
          const assignment = assignments.find((item) => String(item.id) === String(row.assignment));
          return {
            ...row,
            maxScore: assignment?.max_score,
            title: assignment?.title || "Задание",
          };
        })
        .sort((a, b) => new Date(a.graded_at || a.submitted_at || 0) - new Date(b.graded_at || b.submitted_at || 0)),
    [submissions, assignments],
  );

  const avg = averageScore(graded);
  const best =
    graded.length > 0
      ? Math.max(...graded.map((row) => Math.round((Number(row.score) / (row.maxScore || 100)) * 100)))
      : null;
  const latest = graded.length ? graded[graded.length - 1] : null;
  const done = submissions.filter((row) => row.status !== "not_submitted").length;
  const attendance = student
    ? buildStudentAttendanceStats(student.id, lessons, attendanceByLesson, student.group?.id)
    : null;

  if (!student) return null;

  const name = student.full_name || student.name || "—";

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer teacher-drawer tg-student-drawer tr-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tg-student-head">
          <div className="tg-student-identity">
            <span className="tg-student-avatar" style={{ background: avatarColor(name) }}>
              {studentInitials(student)}
            </span>
            <div>
              <h3>{name}</h3>
              <p className="tg-muted">
                {student.groupName}
                {student.courseName ? ` · ${student.courseName}` : ""}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="tg-student-stats">
          <div className="tg-student-stat">
            <span className="tg-muted">Средний результат</span>
            <strong className={`tr-score-${scoreTone(avg)}`}>{avg != null ? `${avg}%` : "—"}</strong>
          </div>
          <div className="tg-student-stat">
            <span className="tg-muted">Посещаемость</span>
            <strong className={`tg-att-${getAttendanceTone(attendance?.pct)}`}>
              {attendance?.pct != null ? `${attendance.pct}%` : "—"}
            </strong>
          </div>
          <div className="tg-student-stat">
            <span className="tg-muted">Сдано заданий</span>
            <strong>
              {done} / {submissions.length || "—"}
            </strong>
          </div>
          <div className="tg-student-stat">
            <span className="tg-muted">Последний результат</span>
            <strong>
              {latest ? formatScoreLabel(latest.score, latest.maxScore) : "—"}
            </strong>
          </div>
        </div>

        <div className="tg-student-tabs" role="tablist" aria-label="Разделы результатов">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="tg-student-body">
          {tab === "overview" ? (
            <div className="tg-student-grid">
              <section className="tg-student-card">
                <h4>Сводка</h4>
                <dl className="tg-kv">
                  <div>
                    <dt>Средний результат</dt>
                    <dd className={`tr-score-${scoreTone(avg)}`}>{avg != null ? `${avg}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Лучший результат</dt>
                    <dd>{best != null ? `${best}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Последний результат</dt>
                    <dd>{latest ? formatScoreLabel(latest.score, latest.maxScore) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Заданий сдано</dt>
                    <dd>
                      {done} / {submissions.length || 0}
                    </dd>
                  </div>
                  <div>
                    <dt>Посещаемость</dt>
                    <dd>{attendance?.pct != null ? `${attendance.pct}%` : "—"}</dd>
                  </div>
                </dl>
              </section>
              <section className="tg-student-card tg-student-card-wide">
                <h4>Последние оценки</h4>
                {graded.length ? (
                  <ul className="tg-student-rows">
                    {[...graded].reverse().slice(0, 5).map((row) => (
                      <li key={row.id}>
                        <div>
                          <strong>{row.title}</strong>
                          <p className="tg-muted">{formatGradedWhen(row.graded_at || row.submitted_at)}</p>
                        </div>
                        <strong>{formatScoreLabel(row.score, row.maxScore)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="tg-muted">Оценок пока нет</p>
                )}
              </section>
            </div>
          ) : null}

          {tab === "assignments" ? (
            <section className="tg-student-card">
              <h4>Задания</h4>
              {submissions.length ? (
                <ul className="tg-student-rows tg-student-rows-tall">
                  {submissions.map((row) => {
                    const assignment = assignments.find(
                      (item) => String(item.id) === String(row.assignment),
                    );
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="tr-sub-link"
                          onClick={() => onOpenSubmission?.(row, assignment)}
                          disabled={row.status === "not_submitted"}
                        >
                          <strong>{assignment?.title || "Задание"}</strong>
                          <p className="tg-muted">
                            {row.submitted_at || row.graded_at
                              ? formatDate(row.graded_at || row.submitted_at)
                              : "—"}
                          </p>
                        </button>
                        <div className="tg-student-row-meta">
                          <span className="tg-pill tg-pill-muted">
                            {ASSIGNMENT_STATUS_LABELS[row.status] || row.status}
                          </span>
                          {row.score != null ? (
                            <strong>{formatScoreLabel(row.score, assignment?.max_score)}</strong>
                          ) : null}
                          {row.teacher_feedback ? (
                            <span className="tg-muted">{row.teacher_feedback}</span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="tg-muted">Заданий пока нет</p>
              )}
            </section>
          ) : null}

          {tab === "trend" ? (
            <section className="tg-student-card">
              <h4>Динамика</h4>
              {graded.length >= 3 ? (
                <TrendChart points={graded} />
              ) : (
                <p className="tg-muted">
                  Недостаточно данных для графика. Нужно минимум несколько проверенных работ.
                </p>
              )}
              {graded.length ? (
                <ul className="tg-student-rows" style={{ marginTop: 12 }}>
                  {[...graded].reverse().map((row) => (
                    <li key={row.id}>
                      <span>
                        {formatGradedWhen(row.graded_at || row.submitted_at)} · {row.title}
                      </span>
                      <strong>{formatScoreLabel(row.score, row.maxScore)}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === "attendance" ? (
            <section className="tg-student-card">
              <h4>Посещаемость</h4>
              <dl className="tg-kv" style={{ marginBottom: 12 }}>
                <div>
                  <dt>Всего</dt>
                  <dd>{attendance?.pct != null ? `${attendance.pct}%` : "—"}</dd>
                </div>
                <div>
                  <dt>Присутствовал</dt>
                  <dd>{attendance?.present ?? "—"}</dd>
                </div>
                <div>
                  <dt>Опоздал</dt>
                  <dd>{attendance?.late ?? "—"}</dd>
                </div>
                <div>
                  <dt>Пропуски</dt>
                  <dd>{attendance?.absent ?? "—"}</dd>
                </div>
              </dl>
              {attendance?.recent?.length ? (
                <ul className="tg-student-rows">
                  {attendance.recent.map((row) => (
                    <li key={row.date}>
                      <span>{formatDate(row.date)}</span>
                      <span>{ATT_LABELS[row.status] || row.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tg-muted">Посещаемость пока не отмечалась</p>
              )}
            </section>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function TrendChart({ points }) {
  const width = 320;
  const height = 120;
  const pad = 16;
  const values = points.map((row) => percent(row.score, row.maxScore));
  const coords = values.map((pct, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - pct / 100) * (height - pad * 2);
    return { x, y, pct };
  });
  const polyline = coords.map((item) => `${item.x},${item.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="tr-trend-chart" aria-hidden="true">
      {[0, 50, 100].map((tick) => {
        const y = pad + (1 - tick / 100) * (height - pad * 2);
        return (
          <g key={tick}>
            <line x1={pad} y1={y} x2={width - pad} y2={y} className="tr-trend-grid" />
            <text x={2} y={y + 3} className="tr-trend-tick">
              {tick}
            </text>
          </g>
        );
      })}
      <polyline points={polyline} className="tr-trend-path" />
      {coords.map((item, index) => (
        <circle key={index} cx={item.x} cy={item.y} r="3.5" className="tr-trend-dot" />
      ))}
    </svg>
  );
}

function percent(score, maxScore) {
  if (maxScore) return Math.round((Number(score) / Number(maxScore)) * 100);
  return Math.round(Number(score));
}
