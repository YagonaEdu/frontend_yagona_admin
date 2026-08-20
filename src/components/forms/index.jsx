import { useId, useState } from "react";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  error,
  hint,
  disabled,
  name,
  inputMode,
  required,
  minLength,
  placeholder,
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const state = error ? "error" : value ? "filled" : "default";

  return (
    <label className={`field field-${state}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        name={name}
        className="input"
        value={value}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={`${id}-error`} className="field-message error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field-message">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function PasswordField({
  label = "Пароль",
  value,
  onChange,
  autoComplete = "current-password",
  error,
  disabled,
  required,
  minLength,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const state = error ? "error" : value ? "filled" : "default";

  return (
    <div className={`field field-${state} field-password`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="input-wrap">
        <input
          id={id}
          className="input"
          value={value}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          minLength={minLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="input-action"
          type="button"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setVisible((open) => !open)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? (
        <span id={`${id}-error`} className="field-message error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({ label, value, onChange, children, disabled }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {children}
      </select>
    </label>
  );
}
