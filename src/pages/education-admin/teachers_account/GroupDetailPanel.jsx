import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banner, Button, EmptyState, Field } from "@/components/ui";
import { api, invalidateApiCache } from "@/services/api/client";
import { educationSegmentPath } from "@/utils/routes";
import { formatDate, formatTime } from "@/utils/format";
import GroupContextMenu from "./GroupContextMenu";
import StudentDrawer from "./StudentDrawer";
import {
  avatarColor,
  buildLessonAttendanceSummary,
  buildScheduleSummary,
  computeGroupAttendancePct,
  buildStudentAttendanceStats,
  computeStudentAttendancePct,
  formatRuleTime,
  getAttendanceTone,
  getStudentStatus,
  needsAttendanceAction,
  reviewPendingCount,
  studentInitials,
  WEEKDAY_FULL,
} from "./groupHelpers";
import { lessonStatusLabel } from "./utils";
import { IconGroups } from "./tgIcons";

const TABS = [
  { id: "students", label: "Ученики" },
  { id: "attendance", label: "Посещаемость" },
  { id: "assignments", label: "Задания" },
  { id: "results", label: "Результаты" },
  { id: "materials", label: "Материалы" },
  { id: "schedule", label: "Расписание" },
];

const ASSIGNMENT_FILTERS = [
  { id: "active", label: "Активные" },
  { id: "review", label: "На проверку" },
  { id: "closed", label: "Завершённые" },
];

const MATERIAL_TYPES = {
  link: "Ссылка",
  video: "Видео",
  file: "Файл",
  pdf: "PDF",
};

export default function GroupDetailPanel({
  inline = false,
  group,
  teacherName = "",
  initialTab = "students",
  onTabChange,
  onClose,
  enrollments = [],
  students = [],
  assignments = [],
  submissions = [],
  materials = [],
  rules = [],
  lessons = [],
  attendanceByLesson = {},
  courseName = "",
  roomMap = new Map(),
  onOpenAttendance,
  onCreateAssignment,
  onOpenSchedule,
  onOpenAssignments,
  onNotify,
  onRefresh,
}) {
  const { tenantSlug = "" } = useParams();
  const navigate = useNavigate();
  const path = (segment) => educationSegmentPath(tenantSlug, segment);

  const [tab, setTab] = useState(initialTab);
  const [assignmentFilter, setAssignmentFilter] = useState("active");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [materialForm, setMaterialForm] = useState({
    title: "",
    description: "",
    material_type: "link",
    link: "",
    is_published: true,
  });
  const [materialError, setMaterialError] = useState("");

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, group?.id]);

  useEffect(() => {
    setTab("students");
    setSelectedStudent(null);
    setMaterialFormOpen(false);
    setAssignmentFilter("active");
  }, [group?.id]);

  useEffect(() => {
    if (initialTab === "materials") setMaterialFormOpen(true);
  }, [initialTab, group?.id]);

  function switchTab(next) {
    setTab(next);
    onTabChange?.(next);
  }

  const studentMap = useMemo(
    () => new Map(students.map((row) => [String(row.id), row])),
    [students],
  );

  const groupStudents = useMemo(
    () =>
      enrollments
        .filter((row) => String(row.group) === String(group?.id) && row.status === "active")
        .map((row) => studentMap.get(String(row.student)))
        .filter(Boolean),
    [enrollments, group?.id, studentMap],
  );

  const schedule = useMemo(() => buildScheduleSummary(rules), [rules]);
  const roomName = useMemo(() => {
    const roomId = rules.find((row) => row.is_active !== false)?.room;
    return roomMap.get(String(roomId)) || group?.roomName || "—";
  }, [rules, roomMap, group?.roomName]);

  const attendancePct = useMemo(
    () => (group ? computeGroupAttendancePct(lessons, attendanceByLesson, group.id) : null),
    [group, lessons, attendanceByLesson],
  );

  const pastLessons = useMemo(
    () =>
      lessons
        .filter((row) => new Date(row.starts_at) < new Date())
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
        .slice(0, 12),
    [lessons],
  );

  const upcomingLessons = useMemo(
    () =>
      lessons
        .filter((row) => new Date(row.ends_at) >= Date.now())
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
        .slice(0, 6),
    [lessons],
  );

  const attendanceSummary = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    pastLessons.forEach((lesson) => {
      const marks = attendanceByLesson[lesson.id] || [];
      present += marks.filter((row) => row.status === "present").length;
      late += marks.filter((row) => row.status === "late").length;
      absent += marks.filter((row) => row.status === "absent").length;
    });
    return { present, late, absent };
  }, [pastLessons, attendanceByLesson]);

  const publishedAssignments = useMemo(
    () => assignments.filter((row) => row.status === "published"),
    [assignments],
  );

  const pendingReviewsTotal = useMemo(
    () => publishedAssignments.reduce((sum, row) => sum + reviewPendingCount(row), 0),
    [publishedAssignments],
  );

  const studentRows = useMemo(() => {
    return groupStudents.map((student) => {
      const studentSubs = submissions.filter((row) => String(row.student) === String(student.id));
      const graded = studentSubs.filter((row) => row.status === "graded");
      const avg =
        graded.length > 0
          ? Math.round(graded.reduce((sum, row) => sum + Number(row.score || 0), 0) / graded.length)
          : null;
      const done = studentSubs.filter((row) => row.status !== "not_submitted").length;
      const missing = studentSubs.filter((row) => row.status === "not_submitted").length;
      const total = publishedAssignments.length;
      const attendancePctValue = computeStudentAttendancePct(
        student.id,
        lessons,
        attendanceByLesson,
        group?.id,
      );
      const status = getStudentStatus({
        attendancePct: attendancePctValue,
        missingCount: missing,
        totalAssignments: total,
        studentStatus: student.status,
      });

      return {
        ...student,
        attendancePct: attendancePctValue,
        assignmentsDone: total ? `${done} / ${total}` : "—",
        avgScore: avg != null ? `${avg}%` : "—",
        avgRaw: avg,
        studentSubs,
        status,
      };
    });
  }, [groupStudents, submissions, publishedAssignments, lessons, attendanceByLesson, group?.id]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((row) => {
      if (assignmentFilter === "active") return row.status === "published";
      if (assignmentFilter === "review") {
        return row.status === "published" && reviewPendingCount(row) > 0;
      }
      if (assignmentFilter === "closed") return row.status === "closed";
      return true;
    });
  }, [assignments, assignmentFilter]);

  const gradebook = useMemo(() => {
    const cols = publishedAssignments.slice(0, 6);
    const rows = groupStudents.map((student) => {
      const cells = cols.map((assignment) => {
        const sub = submissions.find(
          (row) =>
            String(row.student) === String(student.id) &&
            String(row.assignment) === String(assignment.id),
        );
        return sub?.score != null ? sub.score : "—";
      });
      const graded = submissions.filter(
        (row) => String(row.student) === String(student.id) && row.status === "graded",
      );
      const avg =
        graded.length > 0
          ? Math.round(graded.reduce((sum, row) => sum + Number(row.score || 0), 0) / graded.length)
          : "—";
      const last = graded.sort((a, b) => new Date(b.graded_at) - new Date(a.graded_at))[0];
      return {
        id: student.id,
        name: student.full_name || student.name,
        cells,
        avg,
        lastScore: last?.score ?? "—",
        attendancePct: computeStudentAttendancePct(student.id, lessons, attendanceByLesson, group?.id),
      };
    });
    return { cols, rows };
  }, [groupStudents, publishedAssignments, submissions, lessons, attendanceByLesson, group?.id]);

  const resultsSummary = useMemo(() => {
    const scores = gradebook.rows.map((row) => Number(row.avg)).filter((value) => !Number.isNaN(value));
    const avgGroup = scores.length
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : null;
    const best = scores.length ? Math.max(...scores) : null;
    const gradedCount = submissions.filter((row) => row.status === "graded").length;
    return { avgGroup, best, gradedCount };
  }, [gradebook, submissions]);

  if (!group) return null;

  const attendancePrimary = needsAttendanceAction(group);
  const reviewPrimary = !attendancePrimary && pendingReviewsTotal > 0;

  async function saveMaterial(event) {
    event.preventDefault();
    setMaterialError("");
    try {
      await api.post("/materials", {
        ...materialForm,
        group: group.id,
        course: group.course || null,
      });
      invalidateApiCache("/materials");
      setMaterialFormOpen(false);
      setMaterialForm({
        title: "",
        description: "",
        material_type: "link",
        link: "",
        is_published: true,
      });
      onRefresh?.();
    } catch (err) {
      setMaterialError(err.message);
    }
  }

  function openLessonAttendance(lesson) {
    navigate(`${path("attendance")}?lesson=${lesson.id}`);
  }

  const viewingStudent = Boolean(selectedStudent);

  const content = (
    <div className={`tg-detail${inline ? " tg-detail-inline" : ""}`}>
      {!viewingStudent ? (
        <>
          <header className="tg-detail-head">
            <div className="tg-detail-title">
              <span className="tg-group-icon tg-group-icon-lg">
                <IconGroups size={18} />
              </span>
              <div>
                <h2>{group.name}</h2>
                <p className="tg-muted">{courseName}</p>
                <p className="tg-detail-meta">
                  {groupStudents.length} ученик · {schedule.days} · {schedule.time} · Кабинет {roomName}
                </p>
              </div>
            </div>
            <div className="tg-detail-head-actions">
              {attendancePrimary ? (
                <>
                  <Button onClick={() => onOpenAttendance?.(group)}>Отметить посещаемость</Button>
                  <Button variant="ghost" onClick={() => onCreateAssignment?.(group)}>
                    Создать задание
                  </Button>
                </>
              ) : reviewPrimary ? (
                <>
                  <Button
                    onClick={() => {
                      switchTab("assignments");
                      setAssignmentFilter("review");
                    }}
                  >
                    Проверить работы
                  </Button>
                  <Button variant="ghost" onClick={() => onCreateAssignment?.(group)}>
                    Создать задание
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => onCreateAssignment?.(group)}>Создать задание</Button>
                  <Button variant="ghost" onClick={() => onOpenAttendance?.(group)}>
                    Посещаемость
                  </Button>
                </>
              )}
              <GroupContextMenu
                ariaLabel="Действия с группой"
                onAttendance={() => onOpenAttendance?.(group)}
                onCreateAssignment={() => onCreateAssignment?.(group)}
                onAddMaterial={() => {
                  switchTab("materials");
                  setMaterialFormOpen(true);
                }}
                onNotify={() => onNotify?.()}
                onOpenSchedule={() => onOpenSchedule?.(group.id)}
              />
              {!inline && onClose ? (
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
                  ×
                </button>
              ) : null}
            </div>
          </header>

          <div className="tg-tabs" role="tablist" aria-label="Разделы группы">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "is-active" : ""}
                onClick={() => switchTab(item.id)}
              >
                {item.label}
                {item.id === "assignments" && pendingReviewsTotal > 0 ? (
                  <span className="tg-tab-badge">{pendingReviewsTotal}</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="tg-detail-body">
        {viewingStudent ? (
          <StudentDrawer
            inline
            student={selectedStudent}
            onClose={() => setSelectedStudent(null)}
            submissions={selectedStudent?.studentSubs || []}
            assignments={assignments}
            group={group}
            courseName={courseName}
            attendanceStats={buildStudentAttendanceStats(
              selectedStudent.id,
              lessons,
              attendanceByLesson,
              group.id,
            )}
          />
        ) : null}

        {!viewingStudent && tab === "students" ? (
          <div className="tg-tab-panel">
            {studentRows.length ? (
              <div className="tg-table-wrap">
                <table className="tg-table">
                  <thead>
                    <tr>
                      <th>Ученик</th>
                      <th>Посещаемость</th>
                      <th>Задания</th>
                      <th>Средний результат</th>
                      <th>Статус</th>
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((row) => {
                      const name = row.full_name || row.name || "—";
                      const attTone = getAttendanceTone(row.attendancePct);
                      return (
                        <tr
                          key={row.id}
                          className="tg-row-clickable"
                          tabIndex={0}
                          role="button"
                          onClick={() => setSelectedStudent(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedStudent(row);
                            }
                          }}
                        >
                          <td>
                            <span className="tg-student-cell">
                              <span
                                className="tg-student-avatar-sm"
                                style={{ background: avatarColor(name) }}
                              >
                                {studentInitials(row)}
                              </span>
                              <span className="tg-student-name">{name}</span>
                            </span>
                          </td>
                          <td>
                            <span className={`tg-att-${attTone}`}>
                              {row.attendancePct != null ? `${row.attendancePct}%` : "—"}
                            </span>
                          </td>
                          <td>{row.assignmentsDone}</td>
                          <td>{row.avgScore}</td>
                          <td>
                            <span className={`tg-pill tg-pill-${row.status.tone}`}>{row.status.label}</span>
                          </td>
                          <td className="tg-row-chevron" aria-hidden="true">
                            ›
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="В группе пока нет учеников" />
            )}
          </div>
        ) : null}

        {!viewingStudent && tab === "attendance" ? (
          <div className="tg-tab-panel">
            <div className="tg-mini-summary">
              <div>
                <span className="tg-muted">Средняя посещаемость</span>
                <strong>{attendancePct != null ? `${attendancePct}%` : "—"}</strong>
              </div>
              <div>
                <span className="tg-muted">Присутствовали</span>
                <strong>{attendanceSummary.present}</strong>
              </div>
              <div>
                <span className="tg-muted">Опоздали</span>
                <strong>{attendanceSummary.late}</strong>
              </div>
              <div>
                <span className="tg-muted">Пропуски</span>
                <strong>{attendanceSummary.absent}</strong>
              </div>
            </div>
            <Button onClick={() => onOpenAttendance?.(group)}>Отметить посещаемость</Button>
            <ul className="tg-lesson-list">
              {pastLessons.length ? (
                pastLessons.map((lesson) => {
                  const marks = attendanceByLesson[lesson.id] || [];
                  const summary = buildLessonAttendanceSummary(lesson, marks, groupStudents.length);
                  const unmarked = summary.status === "unmarked";
                  return (
                    <li key={lesson.id} className={unmarked ? "is-unmarked" : ""}>
                      <div>
                        <strong>
                          {formatDate(lesson.starts_at)} · {formatTime(lesson.starts_at)}–
                          {formatTime(lesson.ends_at)}
                        </strong>
                        <p className="tg-muted">
                          Присутствовали {summary.attended} · Опоздали {summary.late} · Отсутствовали{" "}
                          {summary.absent}
                        </p>
                      </div>
                      <Button variant="ghost" onClick={() => openLessonAttendance(lesson)}>
                        Открыть
                      </Button>
                    </li>
                  );
                })
              ) : (
                <EmptyState title="Занятий пока нет" />
              )}
            </ul>
          </div>
        ) : null}

        {!viewingStudent && tab === "assignments" ? (
          <div className="tg-tab-panel">
            <div className="tg-tab-toolbar">
              <div className="tg-subtabs">
                {ASSIGNMENT_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={assignmentFilter === item.id ? "is-active" : ""}
                    onClick={() => setAssignmentFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Button onClick={() => onCreateAssignment?.(group)}>+ Создать задание</Button>
            </div>
            {filteredAssignments.length ? (
              <ul className="tg-assignment-list">
                {filteredAssignments.map((row) => {
                  const pending = reviewPendingCount(row);
                  return (
                    <li key={row.id}>
                      <div>
                        <strong>{row.title}</strong>
                        <p className="tg-muted">
                          Срок: {row.due_at ? formatDate(row.due_at) : "—"}
                        </p>
                        <dl className="tg-assignment-stats">
                          <div>
                            <dt>Сдали</dt>
                            <dd>
                              {row.submitted_count ?? 0} / {groupStudents.length}
                            </dd>
                          </div>
                          <div>
                            <dt>На проверку</dt>
                            <dd>
                              {pending > 0 ? (
                                <button
                                  type="button"
                                  className="tg-link-btn"
                                  onClick={() => onOpenAssignments?.(row.id)}
                                >
                                  {pending}
                                </button>
                              ) : (
                                0
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Не сдали</dt>
                            <dd>{row.missing_count ?? 0}</dd>
                          </div>
                        </dl>
                      </div>
                      <Button variant="ghost" onClick={() => onOpenAssignments?.(row.id)}>
                        Открыть
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="В этой группе пока нет заданий"
                action={
                  <Button onClick={() => onCreateAssignment?.(group)}>Создать первое задание</Button>
                }
              />
            )}
          </div>
        ) : null}

        {!viewingStudent && tab === "results" ? (
          <div className="tg-tab-panel">
            <div className="tg-mini-summary">
              <div>
                <span className="tg-muted">Средний результат группы</span>
                <strong>{resultsSummary.avgGroup != null ? `${resultsSummary.avgGroup}%` : "—"}</strong>
              </div>
              <div>
                <span className="tg-muted">Лучший результат</span>
                <strong>{resultsSummary.best != null ? `${resultsSummary.best}%` : "—"}</strong>
              </div>
              <div>
                <span className="tg-muted">Работ оценено</span>
                <strong>{resultsSummary.gradedCount}</strong>
              </div>
            </div>
            {gradebook.rows.length && gradebook.cols.length ? (
              <div className="tg-gradebook-wrap">
                <table className="tg-gradebook">
                  <thead>
                    <tr>
                      <th>Ученик</th>
                      {gradebook.cols.map((col) => (
                        <th key={col.id}>{col.title}</th>
                      ))}
                      <th>Средний</th>
                      <th>Последний</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradebook.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        {row.cells.map((cell, index) => (
                          <td key={`${row.id}-${index}`}>{cell}</td>
                        ))}
                        <td>{row.avg}</td>
                        <td>{row.lastScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Результаты появятся после проверки заданий" />
            )}
          </div>
        ) : null}

        {!viewingStudent && tab === "materials" ? (
          <div className="tg-tab-panel">
            <div className="tg-tab-toolbar">
              <Button onClick={() => setMaterialFormOpen((prev) => !prev)}>+ Добавить материал</Button>
            </div>
            {materialFormOpen ? (
              <form className="tg-material-form" onSubmit={saveMaterial}>
                {materialError ? <Banner>{materialError}</Banner> : null}
                <Field label="Название">
                  <input
                    required
                    value={materialForm.title}
                    onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })}
                  />
                </Field>
                <Field label="Описание">
                  <textarea
                    rows={2}
                    value={materialForm.description}
                    onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                  />
                </Field>
                <Field label="Тип">
                  <select
                    value={materialForm.material_type}
                    onChange={(e) => setMaterialForm({ ...materialForm, material_type: e.target.value })}
                  >
                    <option value="link">Ссылка</option>
                    <option value="video">Видео</option>
                    <option value="file">Файл</option>
                  </select>
                </Field>
                <Field label="Ссылка">
                  <input
                    value={materialForm.link}
                    onChange={(e) => setMaterialForm({ ...materialForm, link: e.target.value })}
                    placeholder="https://..."
                  />
                </Field>
                <div className="tg-inline-actions">
                  <Button type="button" variant="ghost" onClick={() => setMaterialFormOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit">Опубликовать</Button>
                </div>
              </form>
            ) : null}
            {materials.length ? (
              <ul className="tg-material-list">
                {materials.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.title}</strong>
                      <p className="tg-muted">
                        {MATERIAL_TYPES[row.material_type] || row.material_type} ·{" "}
                        {row.published_at || row.created_at
                          ? formatDate(row.published_at || row.created_at)
                          : "—"}
                      </p>
                    </div>
                    {row.link ? (
                      <a href={row.link} target="_blank" rel="noreferrer">
                        Открыть
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Материалы пока не добавлены" />
            )}
          </div>
        ) : null}

        {!viewingStudent && tab === "schedule" ? (
          <div className="tg-tab-panel">
            {rules.filter((row) => row.is_active !== false).length ? (
              <ul className="tg-schedule-list">
                {rules
                  .filter((row) => row.is_active !== false)
                  .sort((a, b) => a.weekday - b.weekday)
                  .map((row) => (
                    <li key={row.id}>
                      <strong>{WEEKDAY_FULL[row.weekday]}</strong>
                      <p>
                        {formatRuleTime(row.starts_at)}–{formatRuleTime(row.ends_at)}
                      </p>
                      <p className="tg-muted">Кабинет {roomMap.get(String(row.room)) || "—"}</p>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState title="Расписание не задано" />
            )}
            {upcomingLessons.length ? (
              <>
                <h3 className="tg-section-title">Ближайшие занятия</h3>
                <ul className="tg-lesson-list">
                  {upcomingLessons.map((lesson) => (
                    <li key={lesson.id}>
                      <div>
                        <strong>{formatDate(lesson.starts_at)}</strong>
                        <p className="tg-muted">
                          {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenSchedule?.(group.id)}>
              Открыть полное расписание
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer teacher-drawer teacher-drawer-wide" onClick={(e) => e.stopPropagation()}>
        {content}
      </aside>
    </div>
  );
}


