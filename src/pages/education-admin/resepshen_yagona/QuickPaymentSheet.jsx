import { useMemo, useState } from "react";
import { Button, Field, MoneyInput, SearchInput } from "@/components/ui";
import { formatUzPhone, money, today } from "@/utils/format";
import { invoiceBalance, newIdempotencyKey, PAYMENT_METHODS } from "./utils";
import { api } from "@/services/api/client";
import { priceToApi } from "@/utils/format";

export default function QuickPaymentSheet({
  open,
  students,
  invoices,
  currency = "UZS",
  preselectStudentId = "",
  onClose,
  onSuccess,
}) {
  const [studentId, setStudentId] = useState(preselectStudentId || "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paidAt, setPaidAt] = useState(`${today()}T12:00`);
  const [note, setNote] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 40);
    return students
      .filter(
        (s) =>
          String(s.full_name || "")
            .toLowerCase()
            .includes(q) || String(s.phone || "").includes(q),
      )
      .slice(0, 40);
  }, [students, query]);

  const studentInvoices = useMemo(() => {
    if (!studentId) return [];
    return invoices
      .filter((inv) => String(inv.student) === String(studentId))
      .filter((inv) => !["paid", "void", "canceled", "cancelled"].includes(inv.status))
      .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
  }, [invoices, studentId]);

  const debt = useMemo(
    () => studentInvoices.reduce((sum, inv) => sum + Math.max(0, invoiceBalance(inv)), 0),
    [studentInvoices],
  );

  const selectedStudent = students.find((s) => String(s.id) === String(studentId));

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!studentId) throw new Error("Выберите ученика.");
      let targetInvoice = invoiceId;
      const payAmount = priceToApi(amount);
      if (!payAmount || Number(payAmount) <= 0) throw new Error("Укажите сумму.");

      if (!targetInvoice) {
        if (studentInvoices[0]) {
          targetInvoice = String(studentInvoices[0].id);
        } else {
          const created = await api.post("/invoices", {
            student: studentId,
            amount: payAmount,
            due_at: new Date().toISOString(),
            description: note.trim() || "Оплата на ресепшн",
          });
          targetInvoice = String(created.id);
        }
      }

      await api.post("/payments", {
        invoice: targetInvoice,
        amount: payAmount,
        method,
        paid_at: new Date(paidAt).toISOString(),
        note: note.trim(),
        idempotency_key: newIdempotencyKey(),
      });
      onSuccess?.(`Оплата принята: ${money(payAmount, currency)}`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Принять оплату">
      <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet reception-sheet">
        <div className="sheet-head">
          <div>
            <h2>Принять оплату</h2>
            <p className="muted">Быстрый платёж на ресепшн</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="sheet-body" onSubmit={submit}>
          {error ? <p className="field-message error">{error}</p> : null}
          <Field label="Найти ученика">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Имя или телефон"
            />
          </Field>
          <Field label="Ученик *">
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setInvoiceId("");
              }}
              required
            >
              <option value="">—</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · {s.phone ? formatUzPhone(s.phone) : "без телефона"}
                </option>
              ))}
            </select>
          </Field>
          {selectedStudent ? (
            <div className="reception-finance-summary">
              <div>
                <span className="muted">Долг</span>
                <strong>{money(debt, currency)}</strong>
              </div>
              <div>
                <span className="muted">Открытых счетов</span>
                <strong>{studentInvoices.length}</strong>
              </div>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="Счёт">
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Авто / новый</option>
                {studentInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number || inv.id} · долг {money(invoiceBalance(inv), inv.currency || currency)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сумма *">
              <MoneyInput
                value={amount}
                onChange={setAmount}
                currency={currency}
                placeholder="300 000"
                required
              />
            </Field>
            <Field label="Дата *">
              <input
                type="datetime-local"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
              />
            </Field>
            <Field label="Способ *">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Комментарий" className="span-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="sheet-foot">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Принять оплату"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
