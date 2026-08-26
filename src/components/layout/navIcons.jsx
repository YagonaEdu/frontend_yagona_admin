import {
  IconCalendar,
  IconClipboard,
  IconClock,
  IconGroups,
  IconTrend,
  IconUsers,
} from "@/pages/education-admin/teachers_account/tgIcons";

function IconBase({ children, size = 18, className = "" }) {
  return (
    <svg
      className={`nav-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconHome({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.5 20.5V13h5v7.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconBell({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <path
        d="M12 4.5a4 4 0 0 0-4 4v2.6c0 .6-.2 1.2-.6 1.7L6 15.5h12l-1.4-2.7c-.4-.5-.6-1.1-.6-1.7V8.5a4 4 0 0 0-4-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </IconBase>
  );
}

function IconUser({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 19.5c1-2.8 3.4-4.5 6.5-4.5s5.5 1.7 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

function IconFolder({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <path
        d="M4 7.5A1.5 1.5 0 0 1 5.5 6H9l1.5 2H18.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function IconCheck({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <path
        d="M9 12.5 11 14.5 15.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    </IconBase>
  );
}

function IconSettings({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

function IconGrid({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </IconBase>
  );
}

function IconWallet({ size, className }) {
  return (
    <IconBase size={size} className={className}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="14" r="1" fill="currentColor" />
    </IconBase>
  );
}

const NAV_ICON_MAP = {
  "": IconHome,
  groups: IconGroups,
  students: IconUsers,
  schedule: IconCalendar,
  attendance: IconCheck,
  assignments: IconClipboard,
  results: IconTrend,
  materials: IconFolder,
  notifications: IconBell,
  profile: IconUser,
  settings: IconSettings,
  courses: IconFolder,
  rooms: IconGrid,
  teachers: IconUsers,
  billing: IconWallet,
  finance: IconWallet,
  crm: IconGrid,
};

export function NavIcon({ segment = "", size = 18, className }) {
  const Icon = NAV_ICON_MAP[segment] || IconGrid;
  return <Icon size={size} className={className} />;
}

export function IconChevron({ collapsed = false, size = 18 }) {
  return (
    <svg
      className="nav-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {collapsed ? (
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
