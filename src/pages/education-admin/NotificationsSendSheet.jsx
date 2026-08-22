import { useMemo, useState } from "react";
import { Button, Field } from "@/components/ui";
import { api } from "@/services/api/client";
import { formatUzPhone } from "@/utils/format";

const RECIPIENT_MODES = [
  ["student", "Один ученик"],
  ["students", "Несколько"],
  ["group", "Группа"],
  ["course", "Курс"],
  ["all_students", "Все ученики"],
];

const CATEGORY_OPTIONS = [
  ["announcement", "Объявление"],
  ["schedule", "Расписание"],
  ["payment", "Платежи"],
  ["attendance", "Посещаемость"],
];

export default function NotificationsSendSheet({
  open,
  onClose,
  onSent,
  tenantName,
  students,
  groups,
  courses,
  enrollments,
}) {
  const [mode, setMode] = useState("group");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("announcement");
  const [priority, setPriority] = useState("normal");
  const [sendPush, setSendPush] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeStudents = useMemo(
    () => students.filter((item) => item.status === "active"),
    [students],
  );

  const studentGroups = useMemo(() => {
    const map = new Map();
    enrollments
      .filter((item) => item.status === "active")
      .forEach((item) => {
        const key = String(item.student);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(String(item.group));
      });
    return map;
  }, [enrollments]);

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((item) => [String(item.id), item])),
    [groups],
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return activeStudents.filter((student) => {
      if (groupFilter && !(studentGroups.get(String(student.id)) || []).includes(groupFilter)) {
        return false;
      }
      if (courseFilter) {
        const courseGroupIds = groups
          .filter((item) => String(item.course) === courseFilter)
          .map((item) => String(item.id));
        const inCourse = (studentGroups.get(String(student.id)) || []).some((gid) =>
          courseGroupIds.includes(gid),
        );
        if (!inCourse) return false;
      }
      if (!q) return true;
      const phone = student.phone || "";
      return (
        student.full_name?.toLowerCase().includes(q) ||
        phone.includes(q) ||
        formatUzPhone(phone).includes(q)
      );
    });
  }, [activeStudents, studentSearch, groupFilter, courseFilter, studentGroups, groups]);

  const recipientCount = useMemo(() => {
    if (mode === "student") return selectedStudentId ? 1 : 0;
    if (mode === "students") return selectedStudentIds.length;
    if (mode === "group" && selectedGroupId) {
      return enrollments.filter(
        (item) =>
          item.status === "active" && String(item.group) === String(selectedGroupId),
      ).length;
    }
    if (mode === "course" && selectedCourseId) {
      const groupIds = groups
        .filter((item) => String(item.course) === String(selectedCourseId))
        .map((item) => String(item.id));
      return new Set(
        enrollments
          .filter((item) => item.status === "active" && groupIds.includes(String(item.group)))
          .map((item) => String(item.student)),
      ).size;
    }
    if (mode === "all_students") return activeStudents.length;
    return 0;
  }, [
    mode,
    selectedStudentId,
    selectedStudentIds,
    selectedGroupId,
    selectedCourseId,
    enrollments,
    groups,
    activeStudents,
  ]);

  const sendLabel = useMemo(() => {
    if (mode === "group" && selectedGroupId) {
      const group = groupMap[selectedGroupId];
      return `Отправить группе (${recipientCount})`;
    }
    if (mode === "course" && selectedCourseId) return `Отправить курсу (${recipientCount})`;
    if (mode === "all_students") return `Отправить ${recipientCount} ученикам`;
    if (recipientCount) return `Отправить ${recipientCount} ученикам`;
    return "Отправить";
  }, [mode, selectedGroupId, selectedCourseId, recipientCount, groupMap]);

  function toggleStudent(id) {
    const key = String(id);
    setSelectedStudentIds((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  function selectAllVisible() {
    setSelectedStudentIds(filteredStudents.map((item) => String(item.id)));
  }

  async function submit(event) {
    event.preventDefault();
    if (!title.trim() || !message.trim() || recipientCount <= 0) return;
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim(),
      message: message.trim(),
      category,
      priority,
      send_push: sendPush,
      recipient_type: mode,
    };
    if (mode === "student") payload.student_ids = [selectedStudentId];
    if (mode === "students") payload.student_ids = selectedStudentIds;
    if (mode === "group") payload.group_id = selectedGroupId;
    if (mode === "course") payload.course_id = selectedCourseId;
    try {
      await api.post("/notifications/send", payload);
      onSent(recipientCount);
      onClose();
    } catch (err) {
      setError(err.message || "Не удалось отправить уведомление.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Отправить уведомление">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet notifications-send-sheet">
        <div className="sheet-head">
          <div>
            <h2>Отправить уведомление</h2>
            <p className="muted">Сообщение появится в приложении учеников</p>
          </div>
          <button type="button" className="sheet-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="notifications-send-form" onSubmit={submit}>
          <div className="notifications-send-grid">
            <div className="notifications-send-left">
              <p className="notifications-send-label">Получатели</p>
              <div className="notifications-mode-tabs">
                {RECIPIENT_MODES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`notifications-mode-tab${mode === value ? " is-active" : ""}`}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "student" ? (
                <Field label="Ученик">
                  <input
                    placeholder="Поиск по имени или телефону"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    <option value="">Выберите ученика</option>
                    {filteredStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                        {student.phone ? ` · ${formatUzPhone(student.phone)}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {mode === "students" ? (
                <>
                  <div className="notifications-send-filters">
                    <input
                      placeholder="Поиск"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                    <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                      <option value="">Все группы</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="text-action" onClick={selectAllVisible}>
                      Выбрать всех
                    </button>
                  </div>
                  <p className="muted">Выбрано: {selectedStudentIds.length} учеников</p>
                  <div className="notifications-student-pick-list">
                    {filteredStudents.map((student) => (
                      <label key={student.id} className="notifications-student-pick">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(String(student.id))}
                          onChange={() => toggleStudent(student.id)}
                        />
                        <span>
                          <strong>{student.full_name}</strong>
                          <span className="muted">
                            {student.phone ? formatUzPhone(student.phone) : "—"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              {mode === "group" ? (
                <Field label="Группа">
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                  >
                    <option value="">Выберите группу</option>
                    {groups.map((group) => {
                      const count = enrollments.filter(
                        (item) =>
                          item.status === "active" && String(item.group) === String(group.id),
                      ).length;
                      return (
                        <option key={group.id} value={group.id}>
                          {group.name} · {count} активных
                        </option>
                      );
                    })}
                  </select>
                </Field>
              ) : null}

              {mode === "course" ? (
                <Field label="Курс">
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    <option value="">Выберите курс</option>
                    {courses.map((course) => {
                      const courseGroups = groups.filter(
                        (item) => String(item.course) === String(course.id),
                      );
                      const count = new Set(
                        enrollments
                          .filter(
                            (item) =>
                              item.status === "active" &&
                              courseGroups.some((g) => String(g.id) === String(item.group)),
                          )
                          .map((item) => String(item.student)),
                      ).size;
                      return (
                        <option key={course.id} value={course.id}>
                          {course.name} · {courseGroups.length} групп · {count} учеников
                        </option>
                      );
                    })}
                  </select>
                </Field>
              ) : null}

              {mode === "all_students" ? (
                <div className="notifications-all-students-note">
                  <strong>Уведомление получат все активные ученики учебного центра.</strong>
                  <span>Получателей: {activeStudents.length}</span>
                </div>
              ) : null}

              <p className="notifications-recipient-count muted">
                Получателей: {recipientCount}
              </p>
            </div>

            <div className="notifications-send-right">
              <Field label="Заголовок *">
                <input required value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Текст уведомления *">
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
              <div className="notifications-send-row">
                <Field label="Категория">
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Приоритет">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="normal">Обычное</option>
                    <option value="important">Важное</option>
                  </select>
                </Field>
              </div>
              <label className="finance-check">
                <input
                  type="checkbox"
                  checked={sendPush}
                  onChange={(e) => setSendPush(e.target.checked)}
                />
                Отправить push-уведомление
              </label>
              <div className="notifications-preview card">
                <span className="muted">Предпросмотр</span>
                <strong>{title || "Заголовок"}</strong>
                <p>{message || "Текст уведомления"}</p>
                <span className="muted">Отправитель: Учебный центр {tenantName || ""}</span>
              </div>
              {error ? <p className="notifications-send-error">{error}</p> : null}
            </div>
          </div>
          <div className="sheet-foot notifications-send-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <Button
              type="submit"
              disabled={saving || !title.trim() || !message.trim() || recipientCount <= 0}
            >
              {saving ? "Отправка…" : sendLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
