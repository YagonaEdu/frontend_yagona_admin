import { Avatar, Button } from "@/components/ui";
import { formatTime } from "@/utils/format";
import { Link } from "react-router-dom";
import { staffLabel } from "./utils";

export default function TeacherDrawer({
  open,
  teacher,
  courses,
  onClose,
  schedulePath,
  groupsPath,
}) {
  if (!open || !teacher) return null;

  const courseMap = Object.fromEntries((courses || []).map((c) => [String(c.id), c]));
  const phone = teacher.phone || teacher.user?.phone || "";
  const email = teacher.email || teacher.user?.email || "";
  const name = teacher.name || staffLabel(teacher);
  const groups = teacher.groups || [];
  const todayLessons = teacher.todayLessons || [];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Преподаватель">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet sheet-detail reception-sheet">
        <div className="sheet-head">
          <div className="teachers-drawer-head">
            <Avatar name={name} size="lg" />
            <div>
              <h2>{name}</h2>
              <p className="muted">
                {phone || "без телефона"}
                {email ? ` · ${email}` : ""}
              </p>
              <span className={`status ${teacher.is_active === false ? "inactive" : "active"}`}>
                {teacher.is_active === false ? "Неактивен" : "Активен"}
              </span>
            </div>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="sheet-body reception-card-grid">
          <section>
            <h3>Курсы</h3>
            <p>{(teacher.courseNames || []).join(", ") || "—"}</p>
          </section>

          <section>
            <h3>Сегодня</h3>
            {todayLessons.length ? (
              <ul className="reception-att-list">
                {todayLessons.map((lesson) => (
                  <li key={lesson.id}>
                    <span>
                      {formatTime(lesson.starts_at)}{" "}
                      {groups.find((g) => String(g.id) === String(lesson.group))?.name ||
                        lesson.topic ||
                        "занятие"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Сегодня занятий нет</p>
            )}
          </section>

          <section className="span-2">
            <h3>Группы</h3>
            {groups.length ? (
              <ul className="reception-list">
                {groups.map((group) => (
                  <li key={group.id}>
                    <div>
                      <strong>{group.name}</strong>
                      <p className="muted">
                        {courseMap[String(group.course)]?.name || "—"}
                        {group.active_students != null
                          ? ` · ${group.active_students}${group.capacity ? ` / ${group.capacity}` : ""} уч.`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Групп пока нет</p>
            )}
          </section>
        </div>

        <div className="sheet-foot reception-card-actions">
          {phone ? (
            <a className="btn btn-ghost" href={`tel:${phone}`}>
              Позвонить
            </a>
          ) : null}
          <Link className="btn btn-primary" to={schedulePath} onClick={onClose}>
            Открыть расписание
          </Link>
          <Link className="btn btn-ghost" to={groupsPath} onClick={onClose}>
            Группы
          </Link>
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
