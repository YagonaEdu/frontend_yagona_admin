import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PasswordField, TextField } from "@/components/forms";
import { Button, InlineNotice } from "@/components/ui";
import { APP_MODES } from "@/constants";
import { login } from "@/services/auth";
import { formatUzPhone, looksLikeEmail, toLoginIdentifier } from "@/utils/format";
import { educationHomePath } from "@/utils/routes";

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function onIdentifierChange(value) {
    if (!value) {
      setIdentifier("");
      return;
    }
    if (looksLikeEmail(value)) {
      setIdentifier(value);
      return;
    }
    setIdentifier(formatUzPhone(value));
  }

  function validate() {
    const next = {};
    if (!toLoginIdentifier(identifier)) next.identifier = "Укажите email или телефон";
    if (!password) next.password = "Введите пароль";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await login(toLoginIdentifier(identifier), password);
      if (result.mode === APP_MODES.SUPER_ADMIN) navigate("/super", { replace: true });
      else navigate(educationHomePath(result.membership?.tenant_slug), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form-wrap">
      <header className="auth-form-head">
        <span className="auth-badge">Panelga kirish</span>
        <h2 className="auth-form-title">Login va parol</h2>
        <p className="auth-form-lead">
          Platforma yoki o&apos;quv markazi admin paneliga kirish uchun ma&apos;lumotlaringizni kiriting.
        </p>
      </header>

      <form className="auth-form" onSubmit={submit} noValidate>
        <InlineNotice>{error}</InlineNotice>
        <TextField
          label="Login"
          name="identifier"
          value={identifier}
          onChange={onIdentifierChange}
          autoComplete="username"
          inputMode="tel"
          placeholder="+998 99 999 99 99"
          error={fieldErrors.identifier}
          disabled={busy}
        />
        <PasswordField
          label="Parol"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          disabled={busy}
        />
        <Button type="submit" busy={busy} className="auth-submit">
          <span className="auth-submit-label">Kirish</span>
          <span className="auth-submit-arrow" aria-hidden="true">
            →
          </span>
        </Button>
      </form>

      <p className="auth-demo">
        Demo:{" "}
        <button
          type="button"
          className="text-action inline"
          onClick={() => {
            setIdentifier("owner@example.com");
            setPassword("change-me-now");
            setError("");
            setFieldErrors({});
          }}
        >
          owner markazi
        </button>
      </p>
    </div>
  );
}
