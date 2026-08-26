const SUPPORT_HREF =
  import.meta.env.VITE_SUPPORT_URL || "https://t.me/yagona_support";

function HeadsetIcon() {
  return (
    <svg
      className="support-widget-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 12a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4.5 12v3.2a2.3 2.3 0 0 0 2.3 2.3H8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 12v3.2a2.3 2.3 0 0 1-2.3 2.3H16v-1.2a2 2 0 0 0-2-2h-.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 19.5v.8a1.7 1.7 0 0 0 1.7 1.7H15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="11.2"
        width="3.2"
        height="5.2"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="17.8"
        y="11.2"
        width="3.2"
        height="5.2"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export default function SupportWidget() {
  return (
    <div className="support-widget">
      <div className="support-widget-head">
        <div className="support-widget-icon-wrap">
          <HeadsetIcon />
        </div>
        <div className="support-widget-copy">
          <strong>Нужна помощь?</strong>
          <span>Наша поддержка всегда на связи</span>
        </div>
      </div>
      <a
        className="support-widget-btn"
        href={SUPPORT_HREF}
        target="_blank"
        rel="noreferrer"
      >
        Написать в поддержку
      </a>
    </div>
  );
}
