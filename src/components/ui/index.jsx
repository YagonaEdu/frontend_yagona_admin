import { useEffect, useRef, useState } from "react";
import { STATUS_LABELS } from "@/constants";
import { formatMoneyInput, normalizePriceDigits } from "@/utils/format";

export function Banner({ children, tone = "error" }) {
  if (!children) return null;
  const cls = tone === "ok" ? "ok" : tone === "warn" ? "warn" : "";
  return <div className={`banner ${cls}`}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder = "900,000", className = "", ...rest }) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`money-input ${className}`.trim()}
      value={formatMoneyInput(value)}
      placeholder={placeholder}
      onChange={(event) => onChange?.(normalizePriceDigits(event.target.value))}
    />
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions }) {
  return (
    <div className="topbar">
      <div className="topbar-copy">
        {eyebrow ? <div className="topbar-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted lead">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="card compact stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat">{value}</div>
      {hint ? <div className="muted">{hint}</div> : null}
    </div>
  );
}

export function Badge({ value, label }) {
  if (!value && !label) return "—";
  const text = label || STATUS_LABELS[value] || value;
  return <span className={`status ${value || ""}`}>{text}</span>;
}

export function Avatar({ name, size }) {
  const letters = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return <div className={size === "lg" ? "avatar lg" : "avatar"}>{letters}</div>;
}

export function DataTable({ columns, rows, empty = "Пока пусто", onRowClick }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id || index}
              className={onRowClick ? "is-clickable" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={col.align ? { textAlign: col.align } : undefined}
                  onClick={col.stopRowClick ? (event) => event.stopPropagation() : undefined}
                >
                  {col.render ? col.render(row) : row[col.key] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  busy,
  disabled,
  onClick,
  className = "",
}) {
  return (
    <button
      className={`btn btn-${variant} ${busy ? "is-busy" : ""} ${className}`.trim()}
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
      <span className={busy ? "btn-label is-hidden" : "btn-label"}>{children}</span>
    </button>
  );
}

export function InlineNotice({ children, tone = "error" }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${tone}`} role="status">
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function FiltersBar({ children }) {
  return <div className="card filters-bar">{children}</div>;
}

export function TextAction({ children, onClick, type = "button" }) {
  return (
    <button className="text-action" type={type} onClick={onClick}>
      {children}
    </button>
  );
}

export function RowActionsMenu({ items, align = "end" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const visible = (items || []).filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return undefined;
    function close(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div
      className={`row-actions row-actions-${align}`}
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="row-actions-trigger"
        aria-label="Действия"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div className="row-actions-menu" role="menu">
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`row-actions-item ${item.danger ? "is-danger" : ""}`}
              disabled={item.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
