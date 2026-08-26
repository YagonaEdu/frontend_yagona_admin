import { createPortal } from "react-dom";
import { TYPE_OPTIONS } from "./materialHelpers";

export default function MaterialTypeModal({ open, onClose, onSelect }) {
  if (!open) return null;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div className="tm-modal" role="dialog" aria-modal="true" aria-label="Добавить материал" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-head">
          <div>
            <h2>Что вы хотите добавить?</h2>
            <p className="tg-muted">Выберите тип учебного материала</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="tm-type-grid">
          {TYPE_OPTIONS.map((item) => (
            <button key={item.id} type="button" className="tm-type-tile" onClick={() => onSelect(item.id)}>
              <span className={`tm-type-icon tm-type-${item.id}`} aria-hidden="true" />
              <strong>{item.label}</strong>
              <span className="tg-muted">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
