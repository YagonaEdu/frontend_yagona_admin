import { useEffect, useState } from "react";
import { Banner, Badge, DataTable, PageHeader } from "@/components/ui";
import { api } from "@/services/api/client";
import { results } from "@/utils/format";

export default function NotificationsPage() {
  const [outbox, setOutbox] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [outboxData, templateData] = await Promise.all([
          api.get("/notification-outbox?page_size=100"),
          api.get("/notification-templates?page_size=100"),
        ]);
        setOutbox(results(outboxData));
        setTemplates(results(templateData));
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  return (
    <div>
      <PageHeader title="Уведомления" subtitle="Шаблоны и очередь уведомлений центра." />
      <Banner>{error}</Banner>
      <div className="grid cols-2">
        <div className="card">
          <h3>Шаблоны</h3>
          <DataTable
            rows={templates}
            empty="Шаблонов нет"
            columns={[
              { key: "name", title: "Название" },
              { key: "channel", title: "Канал" },
            ]}
          />
        </div>
        <div className="card">
          <h3>Очередь</h3>
          <DataTable
            rows={outbox}
            empty="Очередь пуста"
            columns={[
              { key: "channel", title: "Канал" },
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
