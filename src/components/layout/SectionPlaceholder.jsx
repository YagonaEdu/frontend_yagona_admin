import { EmptyState, PageHeader } from "@/components/ui";

export default function SectionPlaceholder({ title, subtitle }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState
        title="Раздел подключается"
        body="Модуль будет доступен после завершения переноса."
      />
    </>
  );
}
