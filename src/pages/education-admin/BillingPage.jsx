import { useEffect, useState } from "react";
import { Banner, Badge, Button, DataTable, Field, PageHeader } from "@/components/ui";
import { BILLING_TYPE_LABELS } from "@/constants";
import { api } from "@/services/api/client";
import { money, results, today } from "@/utils/format";

export default function BillingPage() {
  const [plans, setPlans] = useState([]);
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState({
    name: "",
    billing_type: "lessons",
    price: "500000",
    currency: "UZS",
    lesson_limit: 8,
    duration_days: 30,
  });
  const [invoice, setInvoice] = useState({
    student: "",
    amount: "500000",
    due_at: `${today()}T18:00`,
    description: "Абонемент",
  });

  async function load() {
    setError("");
    try {
      const [planData, studentData, invoiceData] = await Promise.all([
        api.get("/plans?page_size=100"),
        api.get("/students?page_size=100"),
        api.get("/invoices?page_size=100"),
      ]);
      const studentList = results(studentData);
      setPlans(results(planData));
      setStudents(studentList);
      setInvoices(results(invoiceData));
      setInvoice((prev) => ({ ...prev, student: prev.student || studentList[0]?.id || "" }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createPlan(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/plans", plan);
      setPlan((prev) => ({ ...prev, name: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createInvoice(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/invoices", {
        ...invoice,
        due_at: new Date(invoice.due_at).toISOString(),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Биллинг" subtitle="Тарифы учеников, счета и оплаты центра." />
      <Banner>{error}</Banner>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <form className="card" onSubmit={createPlan}>
          <h3>Новый тариф</h3>
          <div className="grid" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Название">
              <input
                value={plan.name}
                onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Тип">
              <select
                value={plan.billing_type}
                onChange={(e) => setPlan({ ...plan, billing_type: e.target.value })}
              >
                <option value="lessons">Пакет уроков</option>
                <option value="monthly">Месячный</option>
              </select>
            </Field>
            <Field label="Цена">
              <input value={plan.price} onChange={(e) => setPlan({ ...plan, price: e.target.value })} />
            </Field>
            <Button type="submit">Сохранить тариф</Button>
          </div>
        </form>
        <form className="card" onSubmit={createInvoice}>
          <h3>Новый счёт</h3>
          <div className="grid" style={{ gap: 10, marginTop: 10 }}>
            <Field label="Студент">
              <select
                value={invoice.student}
                onChange={(e) => setInvoice({ ...invoice, student: e.target.value })}
              >
                {students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сумма">
              <input
                value={invoice.amount}
                onChange={(e) => setInvoice({ ...invoice, amount: e.target.value })}
              />
            </Field>
            <Field label="Описание">
              <input
                value={invoice.description}
                onChange={(e) => setInvoice({ ...invoice, description: e.target.value })}
              />
            </Field>
            <Button type="submit">Выставить счёт</Button>
          </div>
        </form>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h3>Тарифы</h3>
          <DataTable
            rows={plans}
            empty="Тарифов нет"
            columns={[
              { key: "name", title: "Тариф" },
              {
                key: "billing_type",
                title: "Тип",
                render: (row) => BILLING_TYPE_LABELS[row.billing_type] || row.billing_type,
              },
              {
                key: "price",
                title: "Цена",
                align: "right",
                render: (row) => money(row.price, row.currency),
              },
            ]}
          />
        </div>
        <div className="card">
          <h3>Счета</h3>
          <DataTable
            rows={invoices}
            empty="Счетов нет"
            columns={[
              { key: "number", title: "Номер" },
              {
                key: "amount",
                title: "Сумма",
                align: "right",
                render: (row) => money(row.amount, row.currency),
              },
              {
                key: "status",
                title: "Статус",
                render: (row) => <Badge value={row.status} />,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
