import { Button } from "@/components/ui";
import { STATUS_LABELS } from "@/constants";
import { formatTime, money } from "@/utils/format";

export default function StudentQuickCard({
  open,
  student,
  groupName,
  courseName,
  teacherName,
  parent,
  debt,
  currency,
  recentAttendance,
  onClose,
  onEdit,
  onPay,
  onArrive,
  onNotify,
  onFullProfile,
}) {
  if (!open || !student) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка ученика">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet sheet-detail reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>{student.full_name}</h2>
            <p className="muted">
              {student.phone || "без телефона"}
              {student.phone ? (
                <>
                  {" · "}
                  <a href={`tel:${student.phone}`}>Позвонить</a>
                </>
              ) : null}
            </p>
            <span className={`status ${student.status || ""}`}>
              {STATUS_LABELS[student.status] || student.status}
            </span>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="sheet-body reception-card-grid">
          <section>
            <h3>Обучение</h3>
            <dl className="reception-dl">
              <div>
                <dt>Группа</dt>
                <dd>{groupName || "—"}</dd>
              </div>
              <div>
                <dt>Курс</dt>
                <dd>{courseName || "—"}</dd>
              </div>
              <div>
                <dt>Преподаватель</dt>
                <dd>{teacherName || "—"}</dd>
              </div>
            </dl>
          </section>
          <section>
            <h3>Родитель</h3>
            <dl className="reception-dl">
              <div>
                <dt>Имя</dt>
                <dd>{parent?.full_name || "—"}</dd>
              </div>
              <div>
                <dt>Телефон</dt>
                <dd>
                  {parent?.phone ? <a href={`tel:${parent.phone}`}>{parent.phone}</a> : "—"}
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <h3>Финансы</h3>
            <dl className="reception-dl">
              <div>
                <dt>Долг</dt>
                <dd>{money(debt || 0, currency)}</dd>
              </div>
            </dl>
          </section>
          <section>
            <h3>Посещаемость</h3>
            {recentAttendance?.length ? (
              <ul className="reception-att-list">
                {recentAttendance.slice(0, 5).map((row) => (
                  <li key={row.id || `${row.starts_at}-${row.status}`}>
                    <span>{formatTime(row.starts_at)}</span>
                    <span className={`status ${row.status || ""}`}>
                      {STATUS_LABELS[row.status] || row.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Нет недавних отметок</p>
            )}
          </section>
        </div>
        <div className="sheet-foot reception-card-actions">
          <Button type="button" variant="ghost" onClick={onEdit}>
            Редактировать
          </Button>
          <Button type="button" onClick={onPay}>
            Принять оплату
          </Button>
          <Button type="button" onClick={onArrive}>
            Отметить приход
          </Button>
          <Button type="button" variant="ghost" onClick={onNotify}>
            Уведомление
          </Button>
          <Button type="button" variant="ghost" onClick={onFullProfile}>
            Полный профиль
          </Button>
        </div>
      </div>
    </div>
  );
}
