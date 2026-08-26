import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate, formatUzPhone, money } from "@/utils/format";
import {
  getAttendanceTone,
  getStudentStatus,
  studentInitials,
  avatarColor,
  formatLastActivityLabel,
} from "./groupHelpers";
import { ASSIGNMENT_STATUS_LABELS } from "./utils";

const ATTENDANCE_LABELS = {
  present: "Присутствовал",
  late: "Опоздал",
  absent: "Отсутствовал",
  excused: "Уважительная",
};

const ATTENDANCE_PILL = {
  present: "tg-pill-green",
  late: "tg-pill-warn",
  absent: "tg-pill-warn",
  excused: "tg-pill-blue",
};

const SUB_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "attendance", label: "Посещаемость" },
  { id: "assignments", label: "Задания" },
  { id: "results", label: "Результаты" },
];

export default function StudentDrawer({
  student,
  onClose,
  submissions = [],
  assignments = [],
  group,
  courseName = "",
  attendanceStats = null,
  lastActivity = null,
  debt = 0,
  currency = "UZS",
  inline = false,
}) {
  const [subTab, setSubTab] = useState("overview");

  useEffect(() => {
    setSubTab("overview");
  }, [student?.id]);

  useEffect(() => {
    if (inline || !student) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [inline, student, onClose]);

  if (!student) return null;

  const assignmentMap = new Map(assignments.map((row) => [String(row.id), row]));
  const graded = submissions.filter((row) => row.status === "graded");
  const submitted = submissions.filter((row) => row.status !== "not_submitted");
  const missingCount = submissions.filter((row) => row.status === "not_submitted").length;
  const pendingReview = submissions.filter((row) => ["submitted", "late"].includes(row.status)).length;
  const avg =
    graded.length > 0
      ? Math.round(graded.reduce((sum, row) => sum + Number(row.score || 0), 0) / graded.length)
      : null;

  const initial = studentInitials(student);
  const avatarBg = avatarColor(student.full_name || student.name || "");
  const status = getStudentStatus({
    attendancePct: attendanceStats?.pct,
    missingCount,
    totalAssignments: assignments.filter((row) => row.status === "published").length,
    studentStatus: student.status,
  });

  const activity = lastActivity ? formatLastActivityLabel(lastActivity, submissions) : null;
  const guardians =
    Array.isArray(student.guardians) && student.guardians.length
      ? student.guardians
      : student.guardian
        ? [student.guardian]
        : [];
  const phoneDisplay = formatUzPhone(student.phone) || student.phone || "—";
  const attentionItems = [];
  if (status.label !== "Активен") {
    attentionItems.push({ tone: status.tone === "muted" ? "muted" : "warn", label: status.label });
  }
  if (debt > 0) {
    attentionItems.push({ tone: "debt", label: `Задолженность ${money(debt, currency)}` });
  }
  if (missingCount > 0) {
    attentionItems.push({
      tone: "warn",
      label: missingCount === 1 ? "1 задание не сдано" : `${missingCount} задания не сданы`,
    });
  }
  if (pendingReview > 0) {
    attentionItems.push({ tone: "info", label: `${pendingReview} на проверку` });
  }

  const body = (
    <div className={`tg-student${inline ? " tg-student-inline" : ""}`}>
      <header className="tg-student-head">
        <div className="tg-student-title">
          {inline ? (
            <button type="button" className="tg-back-btn" onClick={onClose}>
              ← К списку
            </button>
          ) : null}
          <div className="tg-student-identity">
            <span className="tg-student-avatar" style={{ background: avatarBg }}>
              {initial}
            </span>
            <div>
              <div className="tg-student-name-row">
                <h3>{student.full_name || student.name}</h3>
                <span className={`tg-pill tg-pill-${status.tone}`}>{status.label}</span>
              </div>
              <p className="tg-muted">
                {group?.name}
                {courseName ? ` · ${courseName}` : ""}
              </p>
            </div>
          </div>
        </div>
        {!inline ? (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        ) : null}
      </header>

      <div className="tg-student-stats">
        <div className="tg-student-stat">
          <span className="tg-muted">Посещаемость</span>
          <strong className={`tg-att-${getAttendanceTone(attendanceStats?.pct)}`}>
            {attendanceStats?.pct != null ? `${attendanceStats.pct}%` : "—"}
          </strong>
        </div>
        <div className="tg-student-stat">
          <span className="tg-muted">Задания</span>
          <strong>
            {submitted.length} / {submissions.length || assignments.length || "—"}
          </strong>
        </div>
        <div className="tg-student-stat">
          <span className="tg-muted">Средний балл</span>
          <strong>{avg != null ? `${avg}%` : "—"}</strong>
        </div>
        <div className="tg-student-stat">
          <span className="tg-muted">Последняя активность</span>
          <strong className="tg-student-stat-sm">
            {activity ? `${activity.prefix} · ${activity.dateLabel}` : "—"}
          </strong>
        </div>
      </div>

      <div className="tg-student-tabs" role="tablist" aria-label="Разделы ученика">
        {SUB_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={subTab === item.id}
            className={subTab === item.id ? "is-active" : ""}
            onClick={() => setSubTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tg-student-body">
        {subTab === "overview" ? (
          <div className="tg-student-grid">
            {attentionItems.length ? (
              <section className="tg-student-card tg-student-card-wide tg-student-attention">
                <h4>Требует внимания</h4>
                <div className="tg-reason-chips">
                  {attentionItems.map((item) => (
                    <span key={item.label} className={`tg-reason-chip tg-reason-${item.tone}`}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={`tg-student-card tg-debt-card${debt > 0 ? " has-debt" : ""}`}>
              <h4>Задолженность</h4>
              <p className="tg-debt-label">Текущий долг</p>
              <p className={`tg-debt-value${debt > 0 ? " is-debt" : ""}`}>
                {debt > 0 ? money(debt, currency) : "Нет долга"}
              </p>
            </section>

            <section className="tg-student-card">
              <h4>Контакты</h4>
              <dl className="tg-kv">
                <div>
                  <dt>Телефон</dt>
                  <dd>{phoneDisplay}</dd>
                </div>
                <div>
                  <dt>Дата рождения</dt>
                  <dd>{formatDate(student.birth_date)}</dd>
                </div>
                {guardians.length ? (
                  guardians.map((item) => (
                    <div key={item.id || `${item.full_name}-${item.phone}`}>
                      <dt>{item.full_name || "Родитель"}</dt>
                      <dd>{formatUzPhone(item.phone) || item.phone || "—"}</dd>
                    </div>
                  ))
                ) : (
                  <div>
                    <dt>Родители</dt>
                    <dd>—</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="tg-student-card">
              <h4>Обучение</h4>
              <dl className="tg-kv">
                <div>
                  <dt>Группа</dt>
                  <dd>{group?.name || "—"}</dd>
                </div>
                <div>
                  <dt>Курс</dt>
                  <dd>{courseName || "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="tg-student-card">
              <h4>Посещаемость</h4>
              <dl className="tg-kv">
                <div>
                  <dt>Всего</dt>
                  <dd className={`tg-att-${getAttendanceTone(attendanceStats?.pct)}`}>
                    {attendanceStats?.pct != null ? `${attendanceStats.pct}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Присутствовал</dt>
                  <dd>{attendanceStats?.present ?? "—"}</dd>
                </div>
                <div>
                  <dt>Опоздал</dt>
                  <dd>{attendanceStats?.late ?? "—"}</dd>
                </div>
                <div>
                  <dt>Пропуски</dt>
                  <dd>{attendanceStats?.absent ?? "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="tg-student-card tg-student-card-wide">
              <h4>Последние задания</h4>
              {submissions.length ? (
                <ul className="tg-student-rows">
                  {submissions.slice(0, 4).map((row) => {
                    const assignment = assignmentMap.get(String(row.assignment));
                    return (
                      <li key={row.id}>
                        <span>{assignment?.title || "Задание"}</span>
                        <div className="tg-student-row-meta">
                          <span className={`tg-pill ${statusPill(row.status)}`}>
                            {ASSIGNMENT_STATUS_LABELS[row.status] || row.status}
                          </span>
                          {row.score != null ? <strong>{row.score}</strong> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="tg-muted">Заданий пока нет</p>
              )}
            </section>
          </div>
        ) : null}

        {subTab === "attendance" ? (
          <section className="tg-student-card">
            <h4>История посещаемости</h4>
            {attendanceStats?.recent?.length ? (
              <ul className="tg-student-rows">
                {attendanceStats.recent.map((row) => (
                  <li key={row.date}>
                    <span>{formatDate(row.date)}</span>
                    <span className={`tg-pill ${ATTENDANCE_PILL[row.status] || ""}`}>
                      {ATTENDANCE_LABELS[row.status] || row.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tg-muted">Посещаемость пока не отмечалась</p>
            )}
          </section>
        ) : null}

        {subTab === "assignments" ? (
          <section className="tg-student-card">
            <div className="tg-student-card-head">
              <h4>Задания</h4>
              <span className="tg-muted">
                Сдано {submitted.length} · Не сдано {missingCount}
              </span>
            </div>
            {submissions.length ? (
              <ul className="tg-student-rows tg-student-rows-tall">
                {submissions.map((row) => {
                  const assignment = assignmentMap.get(String(row.assignment));
                  return (
                    <li key={row.id}>
                      <div>
                        <strong>{assignment?.title || "Задание"}</strong>
                        {assignment?.due_at ? (
                          <p className="tg-muted">Срок: {formatDate(assignment.due_at)}</p>
                        ) : null}
                      </div>
                      <div className="tg-student-row-meta">
                        <span className={`tg-pill ${statusPill(row.status)}`}>
                          {ASSIGNMENT_STATUS_LABELS[row.status] || row.status}
                        </span>
                        {row.score != null ? (
                          <strong>
                            {row.score}
                            {assignment?.max_score ? ` / ${assignment.max_score}` : ""}
                          </strong>
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

        {subTab === "results" ? (
          <section className="tg-student-card">
            <h4>Результаты</h4>
            <p className="tg-student-avg">
              Средний балл: <strong>{avg != null ? `${avg}%` : "—"}</strong>
            </p>
            {graded.length ? (
              <ul className="tg-student-rows">
                {graded.map((row) => {
                  const assignment = assignmentMap.get(String(row.assignment));
                  return (
                    <li key={row.id}>
                      <div>
                        <strong>{assignment?.title || "Задание"}</strong>
                        <p className="tg-muted">
                          {row.graded_at ? formatDate(row.graded_at) : "—"}
                        </p>
                      </div>
                      <div className="tg-student-row-meta">
                        <strong>
                          {row.score}
                          {assignment?.max_score ? ` / ${assignment.max_score}` : ""}
                        </strong>
                        {row.feedback ? <span className="tg-muted">{row.feedback}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="tg-muted">Оценок пока нет</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );

  if (inline) return body;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer teacher-drawer tg-student-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={student.full_name || student.name || "Ученик"}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </aside>
    </div>,
    document.body,
  );
}

function statusPill(status) {
  if (status === "graded") return "tg-pill-green";
  if (status === "not_submitted") return "tg-pill-warn";
  return "tg-pill-blue";
}
