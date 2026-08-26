import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { STATUS_LABELS } from "@/constants";
import { formatDay, formatTime } from "@/utils/format";
import { formatUzPhone } from "@/utils/format";
import { parseTrialTopic, staffLabel } from "./utils";

export default function TrialDetailPanel({
  lesson,
  group,
  course,
  teacher,
  room,
  lead,
  crmPath,
  schedulePath,
  busy,
  saving,
  onMarkStatus,
  onCancel,
}) {
  if (!lesson) {
    return (
      <section className="reception-panel trials-detail-panel trials-detail-empty">
        <h2>Детали</h2>
        <p className="muted">Выберите пробный урок из списка, чтобы посмотреть информацию и отметить статус.</p>
      </section>
    );
  }

  const parsed = parseTrialTopic(lesson.topic);
  const status = lesson.status || "scheduled";

  return (
    <section className="reception-panel trials-detail-panel">
      <div className="reception-panel-head">
        <div>
          <h2>{parsed.name || "Посетитель"}</h2>
          <p className="muted reception-panel-sub">
            {formatDay(lesson.starts_at)} · {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
          </p>
        </div>
        <span className={`status ${status}`}>{STATUS_LABELS[status] || status}</span>
      </div>

      <div className="reception-card-grid trials-detail-grid">
        <section className="span-2">
          <h3>Контакт</h3>
          <dl className="reception-dl">
            <div>
              <dt>Телефон</dt>
              <dd>
                {parsed.phone ? (
                  <a href={`tel:${parsed.phone}`}>{formatUzPhone(parsed.phone)}</a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {lead ? (
              <div>
                <dt>Карточка в CRM</dt>
                <dd>
                  <Link to={crmPath}>{lead.full_name}</Link>
                  {lead.source_details ? ` · ${lead.source_details}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section>
          <h3>Занятие</h3>
          <dl className="reception-dl">
            <div>
              <dt>Группа</dt>
              <dd>{group?.name || "—"}</dd>
            </div>
            <div>
              <dt>Курс</dt>
              <dd>{course?.name || "—"}</dd>
            </div>
            <div>
              <dt>Кабинет</dt>
              <dd>{room?.name || "—"}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Преподаватель</h3>
          <dl className="reception-dl">
            <div>
              <dt>Имя</dt>
              <dd>{teacher ? staffLabel(teacher) : "—"}</dd>
            </div>
            {teacher?.phone || teacher?.user?.phone ? (
              <div>
                <dt>Телефон</dt>
                <dd>
                  <a href={`tel:${teacher.phone || teacher.user?.phone}`}>
                    {teacher.phone || teacher.user?.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {busy ? (
              <div>
                <dt>Загрузка</dt>
                <dd className="muted">{busy}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {parsed.comment ? (
          <section className="span-2">
            <h3>Комментарий</h3>
            <p>{parsed.comment}</p>
          </section>
        ) : null}
      </div>

      {status !== "cancelled" ? (
        <div className="reception-card-actions trials-detail-actions">
          {parsed.phone ? (
            <a className="btn btn-ghost" href={`tel:${parsed.phone}`}>
              Позвонить
            </a>
          ) : null}
          <Button type="button" size="sm" disabled={saving} onClick={() => onMarkStatus("Пришёл")}>
            Пришёл
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => onMarkStatus("Не пришёл")}
          >
            Не пришёл
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
            Отменить
          </Button>
          <Link className="btn btn-ghost" to={schedulePath}>
            Расписание
          </Link>
        </div>
      ) : (
        <p className="muted trials-detail-cancelled">Занятие отменено</p>
      )}
    </section>
  );
}
