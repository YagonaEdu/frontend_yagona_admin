export const LOGO_SRC = "/yagona-logo.png";
export const MARK_SRC = "/yagona-mark.png";

export function YagonaLogo({ size = 88, alt = "Yagona", className = "", mark = false }) {
  return (
    <img
      src={mark ? MARK_SRC : LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      className={`yagona-logo ${className}`.trim()}
      draggable="false"
    />
  );
}

export function BrandMark({ title = "Yagona", subtitle, compact = false }) {
  return (
    <div className={compact ? "brand-mark compact" : "brand-mark"}>
      <YagonaLogo size={compact ? 28 : 32} mark />
      <div>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}

export function PatternField({ className = "" }) {
  return <div className={`pattern-field ${className}`.trim()} aria-hidden="true" />;
}
