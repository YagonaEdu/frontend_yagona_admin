import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  EmptyState,
  Field,
  PageHeader,
} from "@/components/ui";
import { STATUS_LABELS } from "@/constants";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import {
  formatDate,
  formatTime,
  formatUzPhone,
  results,
  today,
} from "@/utils/format";

const ATTENDANCE_STATUSES = [
  { value: "present", label: "Присутствовал", icon: "✓", chip: "✓ Присутствовал" },
  { value: "late", label: "Опоздал", icon: "◷", chip: "◷ Опоздал" },
  { value: "absent", label: "Отсутствовал", icon: "×", chip: "× Отсутствовал" },
  { value: "excused", label: "Уважительная", icon: "✓", chip: "✓ Уважительная" },
];

const OWNER_KPI = [
  { key: "lessons", label: "Занятий сегодня", tone: "blue", icon: "◷" },
  { key: "scheduled", label: "Учеников по расписанию", tone: "blue", icon: "∑" },
  { key: "present", label: "Пришли", tone: "green", icon: "✓", share: "present" },
  { key: "late", label: "Опоздали", tone: "orange", icon: "◷", share: "late" },
  { key: "absent", label: "Отсутствовали", tone: "red", icon: "×", share: "absent" },
  { key: "avgPct", label: "Средняя посещаемость", tone: "green", icon: "%" },
];

const MARK_STATUS_LABELS = {
  marked: "Отмечено",
  partial: "Частично",
  unmarked: "Не отмечено",
};

function asList(path) {
  return api.get(path).then(results);
}

async function optionalList(path) {
  try {
    return await asList(path);
  } catch {
    return [];
  }
}

function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function staffLabel(staff, id) {
  if (!id) return "—";
  const item = staff.find((row) => String(row.id) === String(id));
  if (!item?.user) return "—";
  const user = item.user;
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
}

function lessonDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function statusLabel(value) {
  return ATTENDANCE_STATUSES.find((item) => item.value === value)?.label || STATUS_LABELS[value] || value;
}

function needsComment(status) {
  return status === "absent" || status === "late" || status === "excused";
}

function computeRange(preset, anchorDate, customFrom, customTo) {
  if (preset === "custom") {
    return { from: customFrom || anchorDate, to: customTo || anchorDate };
  }
  if (preset === "today") {
    const d = anchorDate || today();
    return { from: d, to: d };
  }
  const anchor = new Date(`${anchorDate || today()}T12:00:00`);
  if (preset === "week") {
    const day = anchor.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(anchor);
    mon.setDate(anchor.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: isoDate(mon), to: isoDate(sun) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

function expectedStudents(groupId, enrollments) {
  return enrollments.filter(
    (item) => String(item.group) === String(groupId) && item.status === "active",
  ).length;
}

function lessonAttendanceStats(records, expected) {
  const present = records.filter((item) => item.status === "present").length;
  const late = records.filter((item) => item.status === "late").length;
  const absent = records.filter((item) => item.status === "absent").length;
  const excused = records.filter((item) => item.status === "excused").length;
  const marked = records.length;
  let markStatus = "unmarked";
  if (expected > 0 && marked >= expected) markStatus = "marked";
  else if (marked > 0) markStatus = "partial";
  const pct = expected ? Math.round((present / expected) * 100) : 0;
  return { present, late, absent, excused, marked, expected, pct, markStatus };
}

function pctFilterMatch(pct, filter) {
  if (!filter) return true;
  if (filter === "high") return pct > 90;
  if (filter === "mid") return pct >= 70 && pct <= 90;
  if (filter === "low") return pct < 70;
  return true;
}

function pctTone(pct) {
  if (pct >= 90) return "good";
  if (pct >= 70) return "mid";
  return "bad";
}

function groupCode(group) {
  if (!group?.id) return "";
  return `Группа ${String(group.id).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function dayAttendancePct(dayLessons, enrollments, attendanceCache) {
  let expected = 0;
  let present = 0;
  dayLessons.forEach((item) => {
    expected += expectedStudents(item.group, enrollments);
    const rec = attendanceCache[String(item.id)] || [];
    present += rec.filter((row) => row.status === "present").length;
  });
  return expected ? Math.round((present / expected) * 100) : null;
}

function AttendanceLineChart({ points }) {
  const valid = points.filter((item) => item.pct != null);
  if (!valid.length) return <p className="muted">Нет данных за период</p>;

  const width = 280;
  const height = 120;
  const pad = 12;
  const coords = valid.map((item, index) => {
    const x = pad + (index / Math.max(valid.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - item.pct / 100) * (height - pad * 2);
    return { x, y, ...item };
  });
  const polyline = coords.map((item) => `${item.x},${item.y}`).join(" ");

  return (
    <div className="attendance-line-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="attendance-line-chart" aria-hidden="true">
        {[0, 50, 100].map((tick) => {
          const y = pad + (1 - tick / 100) * (height - pad * 2);
          return (
            <g key={tick}>
              <line x1={pad} y1={y} x2={width - pad} y2={y} className="attendance-line-grid" />
              <text x={4} y={y + 4} className="attendance-line-tick">
                {tick}%
              </text>
            </g>
          );
        })}
        <polyline points={polyline} className="attendance-line-path" />
        {coords.map((item) => (
          <g key={item.date}>
            <circle cx={item.x} cy={item.y} r="4" className="attendance-line-dot" />
            <text x={item.x} y={item.y - 8} textAnchor="middle" className="attendance-line-label">
              {item.pct}%
            </text>
          </g>
        ))}
      </svg>
      <div className="attendance-line-days">
        {coords.map((item) => (
          <span key={item.date}>{formatDate(item.date).slice(0, 5)}</span>
        ))}
      </div>
    </div>
  );
}

function StatusDonut({ present, late, absent, excused }) {
  const total = present + late + absent + excused;
  if (!total) return <p className="muted">Нет отметок за период</p>;
  const p = Math.round((present / total) * 100);
  const l = Math.round((late / total) * 100);
  const a = Math.round((absent / total) * 100);
  const e = Math.max(0, 100 - p - l - a);
  const gradient = `conic-gradient(#22c55e 0 ${p}%, #f59e0b ${p}% ${p + l}%, #ef4444 ${p + l}% ${p + l + a}%, #a78bfa ${p + l + a}% 100%)`;

  return (
    <div className="attendance-status-donut">
      <div className="attendance-status-ring" style={{ background: gradient }}>
        <span>{total}</span>
      </div>
      <ul className="attendance-status-legend">
        <li><i className="tone-present" /> Пришли — {present}</li>
        <li><i className="tone-late" /> Опоздали — {late}</li>
        <li><i className="tone-absent" /> Отсутствовали — {absent}</li>
        <li><i className="tone-excused" /> Уважительная — {excused}</li>
      </ul>
    </div>
  );
}

async function fetchAttendanceBatch(lessonIds) {
  const cache = {};
  for (let i = 0; i < lessonIds.length; i += 8) {
    const chunk = lessonIds.slice(i, i + 8);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        try {
          const data = await api.get(`/lessons/${id}/attendance`);
          const list = Array.isArray(data) ? data : results(data);
          return [String(id), list];
        } catch {
          return [String(id), []];
        }
      }),
    );
    chunkResults.forEach(([id, list]) => {
      cache[id] = list;
    });
  }
  return cache;
}

function LessonAttendanceDetail({
  lesson,
  groupMap,
  courseMap,
  studentMap,
  enrollments,
  staff,
  lessons,
  canWrite,
  onClose,
  onSaved,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftRows, setDraftRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [studentHistory, setStudentHistory] = useState([]);

  const group = groupMap[String(lesson.group)];

  useEffect(() => {
    async function loadAttendance() {
      setError("");
      try {
        const enrolledIds = enrollments
          .filter(
            (item) => String(item.group) === String(lesson.group) && item.status === "active",
          )
          .map((item) => String(item.student));
        const attendance = await api.get(`/lessons/${lesson.id}/attendance`);
        const list = Array.isArray(attendance) ? attendance : results(attendance);
        const attMap = Object.fromEntries(list.map((item) => [String(item.student), item]));
        const rows = enrolledIds
          .map((studentId) => {
            const student = studentMap[studentId];
            if (!student) return null;
            const att = attMap[studentId];
            return {
              student_id: studentId,
              student,
              group_name: group?.name || "—",
              course_name: courseMap[String(group?.course)]?.name || "—",
              status: att?.status || "",
              comment: att?.comment || "",
              marked: Boolean(att),
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, "ru"));
        setDraftRows(rows);
        setDirty(false);
      } catch (err) {
        setError(err.message);
        setDraftRows([]);
      }
    }
    loadAttendance();
  }, [lesson, enrollments, groupMap, courseMap, studentMap, group]);

  const visibleRows = useMemo(() => {
    if (!statusFilter) return draftRows;
    return draftRows.filter((row) => row.status === statusFilter);
  }, [draftRows, statusFilter]);

  const stats = useMemo(() => {
    const total = draftRows.length;
    const present = draftRows.filter((row) => row.status === "present").length;
    const absent = draftRows.filter((row) => row.status === "absent").length;
    const late = draftRows.filter((row) => row.status === "late").length;
    const excused = draftRows.filter((row) => row.status === "excused").length;
    const marked = draftRows.filter((row) => row.status).length;
    const pct = (value) => (total ? Math.round((value / total) * 100) : 0);
    return { total, present, absent, late, excused, marked, pct };
  }, [draftRows]);

  const selectedStudent = selectedStudentId ? studentMap[selectedStudentId] : null;
  const selectedRow = draftRows.find((row) => row.student_id === selectedStudentId) || null;

  const historyStats = useMemo(() => {
    if (!studentHistory.length) return null;
    const total = studentHistory.length;
    const present = studentHistory.filter((item) => item.status === "present").length;
    const late = studentHistory.filter((item) => item.status === "late").length;
    const absent = studentHistory.filter((item) => item.status === "absent").length;
    const excused = studentHistory.filter((item) => item.status === "excused").length;
    const attended = present + late;
    return {
      total,
      present,
      late,
      absent,
      excused,
      percent: total ? Math.round((attended / total) * 100) : 0,
    };
  }, [studentHistory]);

  function setRowStatus(studentId, status) {
    setDraftRows((rows) =>
      rows.map((row) => (row.student_id === studentId ? { ...row, status } : row)),
    );
    setDirty(true);
  }

  function setRowComment(studentId, comment) {
    setDraftRows((rows) =>
      rows.map((row) => (row.student_id === studentId ? { ...row, comment } : row)),
    );
    setDirty(true);
  }

  function markAllPresent() {
    setDraftRows((rows) => rows.map((row) => ({ ...row, status: "present" })));
    setDirty(true);
  }

  async function saveAttendance() {
    if (!canWrite) return;
    const entries = draftRows
      .filter((row) => row.status)
      .map((row) => ({
        student: row.student_id,
        status: row.status,
        comment: row.comment || "",
      }));
    if (!entries.length) {
      setError("Отметьте хотя бы одного ученика.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.put(`/lessons/${lesson.id}/attendance`, { entries });
      setDirty(false);
      onSaved();
      const attendance = await api.get(`/lessons/${lesson.id}/attendance`);
      const list = Array.isArray(attendance) ? attendance : results(attendance);
      const attMap = Object.fromEntries(list.map((item) => [String(item.student), item]));
      setDraftRows((rows) =>
        rows.map((row) => ({
          ...row,
          marked: Boolean(attMap[row.student_id]),
          comment: attMap[row.student_id]?.comment || row.comment,
          status: attMap[row.student_id]?.status || row.status,
        })),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openStudentHistory(studentId) {
    setSelectedStudentId(studentId);
    setHistoryLoading(true);
    setStudentHistory([]);
    try {
      const groupLessons = lessons
        .filter(
          (item) => String(item.group) === String(lesson.group) && item.status !== "cancelled",
        )
        .slice(0, 24);
      const chunks = await Promise.all(
        groupLessons.map(async (item) => {
          try {
            const data = await api.get(`/lessons/${item.id}/attendance`);
            const list = Array.isArray(data) ? data : results(data);
            const record = list.find((row) => String(row.student) === String(studentId));
            if (!record) return null;
            const g = groupMap[String(item.group)];
            return {
              id: record.id,
              starts_at: item.starts_at,
              ends_at: item.ends_at,
              group_name: g?.name || "—",
              status: record.status,
              comment: record.comment || "",
            };
          } catch {
            return null;
          }
        }),
      );
      setStudentHistory(
        chunks
          .filter(Boolean)
          .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at))),
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  const summaryPct = stats.total
    ? Math.round((stats.present / stats.total) * 100)
    : 0;

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{group?.name || "Группа"}</h2>
          <p className="muted">
            {courseMap[String(group?.course)]?.name || "—"} · {staffLabel(staff, lesson.teacher)} ·{" "}
            {formatDate(lesson.starts_at)} · {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
          </p>
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <div className="sheet-body attendance-detail-body">
        <Banner>{error}</Banner>
        <div className="attendance-detail-summary">
          <div className="attendance-detail-kpis">
            <div><span>По списку</span><strong>{stats.total}</strong></div>
            <div><span>Пришли</span><strong>{stats.present}</strong></div>
            <div><span>Опоздали</span><strong>{stats.late}</strong></div>
            <div><span>Отсутствовали</span><strong>{stats.absent}</strong></div>
            <div><span>Уважительная</span><strong>{stats.excused}</strong></div>
            <div><span>Посещаемость</span><strong>{summaryPct}%</strong></div>
          </div>
          {canWrite ? (
            <div className="attendance-table-actions">
              <Button type="button" busy={busy} disabled={!dirty} onClick={saveAttendance}>
                Сохранить
              </Button>
              <Button type="button" className="secondary" onClick={markAllPresent}>
                Отметить всех присутствующими
              </Button>
            </div>
          ) : null}
        </div>

        <Field label="Фильтр по статусу">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option>
            {ATTENDANCE_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <div className={`attendance-layout${selectedStudent ? " has-side" : ""}`}>
          <div className="attendance-table-card attendance-detail-table">
            {!visibleRows.length ? (
              <EmptyState title="Нет учеников" body="Измените фильтр или добавьте учеников в группу." />
            ) : (
              <div className="attendance-table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Ученик</th>
                      <th>Статус</th>
                      <th>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.student_id}
                        className={selectedStudentId === row.student_id ? "is-selected" : undefined}
                      >
                        <td data-label="Ученик" className="attendance-student-cell">
                          <button
                            type="button"
                            className="attendance-student-btn"
                            onClick={() => openStudentHistory(row.student_id)}
                          >
                            <Avatar name={row.student.full_name} />
                            <span>
                              <strong>{row.student.full_name}</strong>
                              {row.student.phone ? (
                                <em>{formatUzPhone(row.student.phone)}</em>
                              ) : null}
                            </span>
                          </button>
                        </td>
                        <td data-label="Статус" className="attendance-status-cell">
                          <div className="attendance-statuses" role="group" aria-label="Статус посещаемости">
                            {ATTENDANCE_STATUSES.map((item) => (
                              <button
                                key={item.value}
                                type="button"
                                disabled={!canWrite}
                                title={item.label}
                                aria-label={item.label}
                                aria-pressed={row.status === item.value}
                                className={`attendance-status-btn tone-${item.value}${
                                  row.status === item.value ? " is-active" : ""
                                }`}
                                onClick={() => setRowStatus(row.student_id, item.value)}
                              >
                                <span className="attendance-status-icon" aria-hidden="true">
                                  {item.icon}
                                </span>
                                <span className="attendance-status-text">{item.label}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                        <td data-label="Комментарий" className="attendance-comment-cell">
                          {needsComment(row.status) || row.comment ? (
                            <input
                              className="attendance-comment"
                              value={row.comment}
                              disabled={!canWrite}
                              placeholder={
                                needsComment(row.status)
                                  ? "Причина или комментарий"
                                  : "Комментарий"
                              }
                              onChange={(e) => setRowComment(row.student_id, e.target.value)}
                            />
                          ) : (
                            <span className="attendance-comment-empty muted">Не требуется</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dirty && canWrite ? (
              <div className="attendance-savebar">
                <span>Есть несохранённые изменения</span>
                <Button type="button" busy={busy} onClick={saveAttendance}>
                  Сохранить
                </Button>
              </div>
            ) : null}
          </div>

          {selectedStudent ? (
            <aside className="card attendance-side">
              <div className="attendance-side-head">
                <Avatar name={selectedStudent.full_name} />
                <div>
                  <div className="attendance-side-eyebrow">Информация об ученике</div>
                  <strong>{selectedStudent.full_name}</strong>
                  <span className="muted">
                    {selectedStudent.phone ? formatUzPhone(selectedStudent.phone) : "без телефона"}
                  </span>
                  {selectedRow ? (
                    <span className="attendance-side-meta">
                      {selectedRow.group_name} · {selectedRow.course_name}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="sheet-close"
                  aria-label="Закрыть"
                  onClick={() => {
                    setSelectedStudentId("");
                    setStudentHistory([]);
                  }}
                >
                  ×
                </button>
              </div>
              {historyLoading ? (
                <p className="muted">Загрузка истории…</p>
              ) : historyStats ? (
                <>
                  <h4 className="attendance-side-title">Статистика посещаемости</h4>
                  <div className="attendance-side-stats">
                    <div className="attendance-donut" style={{ "--pct": `${historyStats.percent}%` }}>
                      <span>{historyStats.percent}%</span>
                    </div>
                    <div className="attendance-side-grid">
                      <div><span>Занятий</span><strong>{historyStats.total}</strong></div>
                      <div><span>Присутствовал</span><strong>{historyStats.present}</strong></div>
                      <div><span>Опоздал</span><strong>{historyStats.late}</strong></div>
                      <div><span>Отсутствовал</span><strong>{historyStats.absent}</strong></div>
                      <div><span>Уважительная</span><strong>{historyStats.excused}</strong></div>
                    </div>
                  </div>
                  <h4 className="attendance-side-title">История посещаемости</h4>
                  <ul className="attendance-history">
                    {studentHistory.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{formatDate(item.starts_at)}</strong>
                          <span>
                            {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                          </span>
                          {item.comment ? <em>{item.comment}</em> : null}
                        </div>
                        <span className={`attendance-pill tone-${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState title="История пока пуста" body="Отметки по этой группе ещё не сохранены." />
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function AttendancePage() {
  const role = currentMembership()?.role;
  const isOwnerView = ["owner", "admin"].includes(role);
  const canWrite = role && role !== "student";

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [attendanceCache, setAttendanceCache] = useState({});
  const [periodPreset, setPeriodPreset] = useState("today");
  const [anchorDate, setAnchorDate] = useState(today());
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [markFilter, setMarkFilter] = useState("");
  const [pctFilter, setPctFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailLessonId, setDetailLessonId] = useState("");

  const range = useMemo(
    () => computeRange(periodPreset, anchorDate, customFrom, customTo),
    [periodPreset, anchorDate, customFrom, customTo],
  );

  async function loadMeta() {
    setError("");
    setLoading(true);
    try {
      const [lessonData, groupData, courseData, staffData, studentData, enrollmentData] =
        await Promise.all([
          asList("/lessons?page_size=500&ordering=-starts_at"),
          asList("/groups?page_size=100"),
          optionalList("/courses?page_size=100"),
          optionalList("/staff?page_size=100"),
          optionalList("/students?page_size=200"),
          optionalList("/enrollments?page_size=500"),
        ]);
      setLessons(lessonData.filter((item) => item.status !== "cancelled"));
      setGroups(groupData);
      setCourses(courseData);
      setStaff(staffData);
      setStudents(studentData);
      setEnrollments(enrollmentData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    if (!info) return undefined;
    const timer = window.setTimeout(() => setInfo(""), 3200);
    return () => window.clearTimeout(timer);
  }, [info]);

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((item) => [String(item.id), item])),
    [groups],
  );
  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((item) => [String(item.id), item])),
    [courses],
  );
  const studentMap = useMemo(
    () => Object.fromEntries(students.map((item) => [String(item.id), item])),
    [students],
  );

  const periodLessons = useMemo(() => {
    return lessons.filter((lesson) => {
      const d = lessonDate(lesson.starts_at);
      return d >= range.from && d <= range.to;
    });
  }, [lessons, range]);

  const cacheLessonIds = useMemo(() => {
    const ids = new Set(periodLessons.map((item) => String(item.id)));
    if (isOwnerView) {
      const cutoff = addDays(today(), -30);
      lessons
        .filter((item) => lessonDate(item.starts_at) >= cutoff)
        .slice(0, 100)
        .forEach((item) => ids.add(String(item.id)));
    }
    return [...ids];
  }, [periodLessons, lessons, isOwnerView]);

  const refreshAttendanceCache = useCallback(async () => {
    if (!cacheLessonIds.length) {
      setAttendanceCache({});
      return;
    }
    setStatsLoading(true);
    try {
      const cache = await fetchAttendanceBatch(cacheLessonIds);
      setAttendanceCache((prev) => ({ ...prev, ...cache }));
    } catch (err) {
      setError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }, [cacheLessonIds]);

  useEffect(() => {
    if (loading) return;
    refreshAttendanceCache();
  }, [loading, refreshAttendanceCache]);

  const allDashboardRows = useMemo(() => {
    return periodLessons.map((lesson) => {
      const group = groupMap[String(lesson.group)];
      const records = attendanceCache[String(lesson.id)] || [];
      const expected = expectedStudents(lesson.group, enrollments);
      const stats = lessonAttendanceStats(records, expected);
      return {
        lesson,
        group,
        groupName: group?.name || "—",
        courseName: courseMap[String(group?.course)]?.name || "—",
        teacherName: staffLabel(staff, lesson.teacher),
        ...stats,
      };
    });
  }, [periodLessons, attendanceCache, enrollments, groupMap, courseMap, staff]);

  const dashboardRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allDashboardRows
      .filter((row) => {
        if (groupFilter && String(row.lesson.group) !== String(groupFilter)) return false;
        if (courseFilter && String(row.group?.course) !== String(courseFilter)) return false;
        if (teacherFilter && String(row.lesson.teacher) !== String(teacherFilter)) return false;
        if (markFilter && row.markStatus !== markFilter) return false;
        if (!pctFilterMatch(row.pct, pctFilter)) return false;
        if (q && !row.groupName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => String(a.lesson.starts_at).localeCompare(String(b.lesson.starts_at)));
  }, [
    allDashboardRows,
    groupFilter,
    courseFilter,
    teacherFilter,
    markFilter,
    pctFilter,
    searchQuery,
  ]);

  const ownerKpi = useMemo(() => {
    const lessonsCount = allDashboardRows.length;
    const scheduled = allDashboardRows.reduce((sum, row) => sum + row.expected, 0);
    const present = allDashboardRows.reduce((sum, row) => sum + row.present, 0);
    const absent = allDashboardRows.reduce((sum, row) => sum + row.absent, 0);
    const late = allDashboardRows.reduce((sum, row) => sum + row.late, 0);
    const avgPct = scheduled ? Math.round((present / scheduled) * 100) : 0;
    const share = (value) => (scheduled ? Math.round((value / scheduled) * 100) : 0);
    return { lessons: lessonsCount, scheduled, present, absent, late, avgPct, share };
  }, [allDashboardRows]);

  const yesterdayPct = useMemo(() => {
    const day = addDays(range.to, -1);
    const dayLessons = lessons.filter((item) => lessonDate(item.starts_at) === day);
    return dayAttendancePct(dayLessons, enrollments, attendanceCache);
  }, [range.to, lessons, enrollments, attendanceCache]);

  const statusBreakdown = useMemo(() => {
    return allDashboardRows.reduce(
      (acc, row) => {
        acc.present += row.present;
        acc.late += row.late;
        acc.absent += row.absent;
        acc.excused += row.excused;
        return acc;
      },
      { present: 0, late: 0, absent: 0, excused: 0 },
    );
  }, [allDashboardRows]);

  const unmarkedLessons = useMemo(
    () =>
      allDashboardRows.filter(
        (row) => row.markStatus === "unmarked" || row.markStatus === "partial",
      ),
    [allDashboardRows],
  );

  const attentionItems = useMemo(() => {
    const items = [];
    allDashboardRows.forEach((row) => {
      const time = `${formatTime(row.lesson.starts_at)} – ${formatTime(row.lesson.ends_at)}`;
      if (row.markStatus === "unmarked") {
        items.push({
          key: `u-${row.lesson.id}`,
          lessonId: row.lesson.id,
          title: `${row.groupName} (${time})`,
          subtitle: "Посещаемость не отмечена",
          badge: "Не отмечено",
          kind: "unmarked",
        });
      } else if (row.pct < 70 && row.expected > 0) {
        items.push({
          key: `l-${row.lesson.id}`,
          lessonId: row.lesson.id,
          title: `${row.groupName} (${time})`,
          subtitle: `Посещаемость ${row.pct}%`,
          badge: "Низкая",
          kind: "low",
        });
      } else if (row.absent >= 3) {
        items.push({
          key: `a-${row.lesson.id}`,
          lessonId: row.lesson.id,
          title: `${row.groupName} (${time})`,
          subtitle: `${row.absent} отсутствующих`,
          badge: "Высокий риск",
          kind: "risk",
        });
      }
    });
    return items.slice(0, 5);
  }, [allDashboardRows]);

  const trendData = useMemo(() => {
    if (!isOwnerView) return [];
    const end = range.to;
    const points = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = addDays(end, -i);
      const dayLessons = lessons.filter((item) => lessonDate(item.starts_at) === date);
      const pct = dayAttendancePct(dayLessons, enrollments, attendanceCache);
      const expected = dayLessons.reduce(
        (sum, item) => sum + expectedStudents(item.group, enrollments),
        0,
      );
      points.push({ date, pct, expected });
    }
    return points;
  }, [isOwnerView, range.to, lessons, attendanceCache, enrollments]);

  const frequentAbsentees = useMemo(() => {
    if (!isOwnerView) return [];
    const cutoff = addDays(today(), -30);
    const recentLessons = lessons.filter((item) => lessonDate(item.starts_at) >= cutoff);
    const byStudent = new Map();

    recentLessons.forEach((item) => {
      const records = attendanceCache[String(item.id)] || [];
      const group = groupMap[String(item.group)];
      records.forEach((record) => {
        if (record.status !== "absent" && record.status !== "excused") return;
        const sid = String(record.student);
        const current = byStudent.get(sid) || {
          studentId: sid,
          student: studentMap[sid],
          groupName: group?.name || "—",
          groupId: String(item.group),
          absences: 0,
          total: 0,
          lastAbsence: "",
        };
        current.absences += record.status === "absent" ? 1 : 0;
        current.total += 1;
        const d = lessonDate(item.starts_at);
        if (!current.lastAbsence || d > current.lastAbsence) current.lastAbsence = d;
        byStudent.set(sid, current);
      });
    });

    return [...byStudent.values()]
      .filter((row) => row.student && row.absences >= 2)
      .map((row) => {
        const attended = row.total - row.absences;
        return {
          ...row,
          pct: row.total ? Math.round((attended / row.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.absences - a.absences || a.pct - b.pct)
      .slice(0, 8);
  }, [isOwnerView, lessons, attendanceCache, groupMap, studentMap]);

  const detailLesson = useMemo(
    () => lessons.find((item) => String(item.id) === String(detailLessonId)) || null,
    [lessons, detailLessonId],
  );

  function setPeriod(preset) {
    setPeriodPreset(preset);
    if (preset === "today") setAnchorDate(today());
  }

  async function exportExcel() {
    if (!dashboardRows.length) return;
    setExporting(true);
    try {
      const { downloadExcel, excelStamp } = await import("@/utils/exportExcel");
      downloadExcel(`poseshchaemost-${range.from}-${range.to}`, dashboardRows, [
        { key: "group", title: "Группа", value: (row) => row.groupName },
        { key: "course", title: "Курс", value: (row) => row.courseName },
        { key: "teacher", title: "Преподаватель", value: (row) => row.teacherName },
        {
          key: "time",
          title: "Время",
          value: (row) =>
            `${formatTime(row.lesson.starts_at)}–${formatTime(row.lesson.ends_at)}`,
        },
        { key: "expected", title: "По списку", value: (row) => row.expected },
        { key: "present", title: "Пришли", value: (row) => row.present },
        { key: "late", title: "Опоздали", value: (row) => row.late },
        { key: "absent", title: "Отсутствовали", value: (row) => row.absent },
        { key: "pct", title: "Посещаемость %", value: (row) => row.pct },
        {
          key: "status",
          title: "Статус отметки",
          value: (row) => MARK_STATUS_LABELS[row.markStatus] || row.markStatus,
        },
        { key: "exported", title: "Экспорт", value: () => excelStamp() },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const subtitle = isOwnerView
    ? "Контроль посещаемости по всем группам учебного центра"
    : "Ваши занятия и отметка посещаемости";

  return (
    <div className="attendance-page">
      <PageHeader
        title="Посещаемость"
        subtitle={subtitle}
        actions={
          <div className="attendance-topbar">
            <div className="attendance-period-tabs">
              {[
                ["today", "Сегодня"],
                ["week", "Неделя"],
                ["month", "Месяц"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`attendance-period-tab${periodPreset === value ? " is-active" : ""}`}
                  onClick={() => setPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="date"
              className="attendance-date-input"
              value={periodPreset === "custom" ? customFrom : anchorDate}
              onChange={(e) => {
                setAnchorDate(e.target.value);
                if (periodPreset === "custom") setCustomFrom(e.target.value);
              }}
            />
            <Button
              type="button"
              className="secondary"
              busy={exporting}
              disabled={!dashboardRows.length}
              onClick={exportExcel}
            >
              Экспорт Excel
            </Button>
          </div>
        }
      />
      <Banner>{error}</Banner>
      {info ? (
        <div className="attendance-toast" role="status">
          {info}
        </div>
      ) : null}

      <div className="attendance-controls card">
        <div className="attendance-filters attendance-dashboard-filters">
          <Field label="Группа">
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Курс">
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">Все курсы</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Преподаватель">
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">Все</option>
              {staff.filter((item) => item.role === "teacher").map((item) => (
                <option key={item.id} value={item.id}>
                  {staffLabel(staff, item.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Статус отметки">
            <select value={markFilter} onChange={(e) => setMarkFilter(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="marked">Отмечено</option>
              <option value="partial">Частично</option>
              <option value="unmarked">Не отмечено</option>
            </select>
          </Field>
          <Field label="Посещаемость">
            <select value={pctFilter} onChange={(e) => setPctFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="high">&gt; 90%</option>
              <option value="mid">70–90%</option>
              <option value="low">&lt; 70%</option>
            </select>
          </Field>
          <Field label="Поиск">
            <input
              type="search"
              placeholder="Поиск по группе"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <EmptyState title="Загрузка…" body="Получаем занятия и группы." />
        </div>
      ) : (
        <>
          <div className="attendance-stats attendance-owner-stats">
            {OWNER_KPI.map((card) => {
              const value =
                card.key === "avgPct" ? `${ownerKpi.avgPct}%` : ownerKpi[card.key] ?? 0;
              let hint = null;
              if (card.share && ownerKpi.scheduled) {
                hint = `${ownerKpi.share(ownerKpi[card.share])}% от ожидаемых`;
              }
              if (card.key === "avgPct" && yesterdayPct != null) {
                const delta = ownerKpi.avgPct - yesterdayPct;
                hint = `${delta >= 0 ? "+" : ""}${delta}% к вчера`;
              }
              return (
                <div key={card.key} className={`attendance-kpi tone-${card.tone}`}>
                  <div className="attendance-kpi-icon" aria-hidden="true">
                    {card.icon}
                  </div>
                  <div className="attendance-kpi-body">
                    <span className="attendance-kpi-label">{card.label}</span>
                    <div className="attendance-kpi-value">
                      <strong>{value}</strong>
                      {hint ? <em>{hint}</em> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {statsLoading ? <p className="muted attendance-loading-note">Обновляем статистику…</p> : null}

          <div className={`attendance-dashboard-grid${isOwnerView ? " has-aside" : ""}`}>
            <div className="attendance-main">
              <div className="card attendance-table-card">
                <div className="attendance-table-head">
                  <div>
                    <h3>Посещаемость по группам и занятиям</h3>
                    <p className="muted">
                      {formatDate(range.from)}
                      {range.from !== range.to ? ` — ${formatDate(range.to)}` : ""}
                    </p>
                  </div>
                </div>
                {!dashboardRows.length ? (
                  <EmptyState
                    title="Нет занятий"
                    body="На выбранный период нет занятий по текущим фильтрам."
                  />
                ) : (
                  <div className="attendance-table-wrap">
                    <table className="attendance-table attendance-dashboard-table">
                      <thead>
                        <tr>
                          <th>Группа</th>
                          <th>Курс</th>
                          <th>Преподаватель</th>
                          <th>Время</th>
                          <th>По списку</th>
                          <th>Пришли</th>
                          <th>Опоздали</th>
                          <th>Отсутствовали</th>
                          <th>Посещаемость</th>
                          <th>Статус</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardRows.map((row) => (
                          <tr key={row.lesson.id}>
                            <td data-label="Группа">
                              <strong>{row.groupName}</strong>
                              <span className="muted attendance-group-code">
                                {groupCode(row.group)}
                              </span>
                            </td>
                            <td data-label="Курс">{row.courseName}</td>
                            <td data-label="Преподаватель">{row.teacherName}</td>
                            <td data-label="Время">
                              {formatTime(row.lesson.starts_at)} – {formatTime(row.lesson.ends_at)}
                            </td>
                            <td data-label="По списку">{row.expected}</td>
                            <td data-label="Пришли">{row.present}</td>
                            <td data-label="Опоздали">{row.late}</td>
                            <td data-label="Отсутствовали">{row.absent}</td>
                            <td data-label="Посещаемость">
                              <div className="attendance-pct-cell">
                                <div className="attendance-pct-bar">
                                  <span
                                    className={`tone-${pctTone(row.pct)}`}
                                    style={{ width: `${row.pct}%` }}
                                  />
                                </div>
                                <strong>{row.pct}%</strong>
                              </div>
                            </td>
                            <td data-label="Статус">
                              <Badge
                                value={row.markStatus}
                                label={MARK_STATUS_LABELS[row.markStatus] || row.markStatus}
                              />
                            </td>
                            <td data-label="Действие">
                              <Button
                                type="button"
                                className="secondary compact"
                                onClick={() => setDetailLessonId(row.lesson.id)}
                              >
                                Подробнее
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {isOwnerView ? (
                <div className="attendance-bottom-grid">
                  <section className="card attendance-bottom-card">
                    <h3>Статистика по статусам</h3>
                    <StatusDonut {...statusBreakdown} />
                  </section>
                  <section className="card attendance-bottom-card">
                    <h3>Занятия без отметки</h3>
                    {!unmarkedLessons.length ? (
                      <p className="muted">Все занятия отмечены.</p>
                    ) : (
                      <ul className="attendance-unmarked-list">
                        {unmarkedLessons.slice(0, 6).map((row) => (
                          <li key={row.lesson.id}>
                            <button type="button" onClick={() => setDetailLessonId(row.lesson.id)}>
                              <strong>{row.groupName}</strong>
                              <span>
                                {formatTime(row.lesson.starts_at)} – {formatTime(row.lesson.ends_at)} ·{" "}
                                {row.expected} уч.
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              ) : null}
            </div>

            {isOwnerView ? (
              <aside className="attendance-aside">
                <section className="card attendance-aside-card">
                  <div className="attendance-aside-head">
                    <h3>Требует внимания</h3>
                    {attentionItems.length ? (
                      <button type="button" className="attendance-link-btn">
                        Смотреть все
                      </button>
                    ) : null}
                  </div>
                  {!attentionItems.length ? (
                    <p className="muted">Проблем не найдено.</p>
                  ) : (
                    <ul className="attendance-attention-list">
                      {attentionItems.map((item) => (
                        <li key={item.key}>
                          <button type="button" onClick={() => setDetailLessonId(item.lessonId)}>
                            <span className={`attendance-attention-icon kind-${item.kind}`} aria-hidden="true">
                              !
                            </span>
                            <span className="attendance-attention-body">
                              <strong>{item.title}</strong>
                              <em>{item.subtitle}</em>
                            </span>
                            <span className={`attendance-attention-badge kind-${item.kind}`}>
                              {item.badge}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="card attendance-aside-card">
                  <div className="attendance-aside-head">
                    <h3>Посещаемость за 7 дней</h3>
                    <button type="button" className="attendance-link-btn">
                      Детали
                    </button>
                  </div>
                  <AttendanceLineChart points={trendData} />
                </section>

                <section className="card attendance-aside-card">
                  <div className="attendance-aside-head">
                    <h3>Учащиеся с частыми пропусками</h3>
                    {frequentAbsentees.length ? (
                      <button type="button" className="attendance-link-btn">
                        Смотреть все
                      </button>
                    ) : null}
                  </div>
                  {!frequentAbsentees.length ? (
                    <p className="muted">Данных пока нет.</p>
                  ) : (
                    <ul className="attendance-absentees-list">
                      {frequentAbsentees.slice(0, 4).map((row) => (
                        <li key={row.studentId}>
                          <button
                            type="button"
                            onClick={() => {
                              const lesson = lessons.find(
                                (item) =>
                                  String(item.group) === row.groupId &&
                                  lessonDate(item.starts_at) >= addDays(today(), -30),
                              );
                              if (lesson) setDetailLessonId(lesson.id);
                            }}
                          >
                            <Avatar name={row.student.full_name} />
                            <span className="attendance-absentee-body">
                              <strong>{row.student.full_name}</strong>
                              <em>
                                {row.groupName} · {row.absences} пропусков
                              </em>
                            </span>
                            <span className={`attendance-absentee-pct tone-${pctTone(row.pct)}`}>
                              {row.pct}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            ) : null}
          </div>
        </>
      )}

      {detailLesson ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Детали посещаемости">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setDetailLessonId("")}
          />
          <div className="sheet sheet-wide">
            <LessonAttendanceDetail
              lesson={detailLesson}
              groupMap={groupMap}
              courseMap={courseMap}
              studentMap={studentMap}
              enrollments={enrollments}
              staff={staff}
              lessons={lessons}
              canWrite={canWrite}
              onClose={() => setDetailLessonId("")}
              onSaved={() => {
                setInfo("Посещаемость сохранена.");
                refreshAttendanceCache();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
