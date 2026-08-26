export default function PageFallback({ label = "Загрузка…" }) {
  return (
    <div className="page-fallback" role="status" aria-live="polite">
      <span className="page-fallback-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
