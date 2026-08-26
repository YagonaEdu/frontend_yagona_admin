import { Button } from "@/components/ui";

export default function ReminderConfirmModal({
  open,
  title = "Отправить напоминание?",
  recipients = 0,
  assignmentTitle = "",
  busy = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="ta-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="ta-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reminder-modal-title">{title}</h3>
        <dl className="ta-modal-meta">
          <div>
            <dt>Получатели</dt>
            <dd>{recipients} учеников</dd>
          </div>
          <div>
            <dt>Задание</dt>
            <dd>{assignmentTitle || "—"}</dd>
          </div>
        </dl>
        <div className="ta-modal-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={onConfirm} busy={busy}>
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
