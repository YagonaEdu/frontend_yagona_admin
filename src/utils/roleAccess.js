import { ROLES } from "@/constants";

/**
 * Capability map — single source for route guards, nav filtering, and page actions.
 * Owner is a superset of admin operational capabilities.
 */
export const CAPABILITIES = {
  "crm.view": [ROLES.OWNER, ROLES.ADMIN],
  "crm.manage": [ROLES.OWNER, ROLES.ADMIN],

  "students.view": [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER, ROLES.ACCOUNTANT],
  "students.create": [ROLES.OWNER, ROLES.ADMIN],
  "students.edit": [ROLES.OWNER, ROLES.ADMIN],

  "courses.manage": [ROLES.OWNER, ROLES.ADMIN],
  "groups.manage": [ROLES.OWNER, ROLES.ADMIN],
  "groups.view_own": [ROLES.TEACHER],
  "rooms.manage": [ROLES.OWNER, ROLES.ADMIN],
  "teachers.view": [ROLES.OWNER, ROLES.ADMIN],
  "trials.manage": [ROLES.OWNER, ROLES.ADMIN],
  "schedule.manage": [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER],
  "schedule.view_own": [ROLES.TEACHER],
  "attendance.manage": [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER],
  "attendance.view_own": [ROLES.TEACHER],
  "attendance.manage_own": [ROLES.TEACHER],

  "assignments.view_own": [ROLES.TEACHER],
  "assignments.create": [ROLES.TEACHER],
  "assignments.edit_own": [ROLES.TEACHER],
  "assignments.grade": [ROLES.TEACHER],

  "results.view_own": [ROLES.TEACHER],
  "results.manage_own": [ROLES.TEACHER],

  "materials.view_own": [ROLES.TEACHER],
  "materials.manage_own": [ROLES.TEACHER],

  "payments.view": [ROLES.OWNER, ROLES.ADMIN, ROLES.ACCOUNTANT],
  "payments.create": [ROLES.OWNER, ROLES.ADMIN],

  "finance.view": [ROLES.OWNER, ROLES.ACCOUNTANT],
  "finance.manage": [ROLES.OWNER],
  "payroll.view": [ROLES.OWNER, ROLES.ACCOUNTANT],
  "payroll.manage": [ROLES.OWNER],

  "staff.view": [ROLES.OWNER, ROLES.ADMIN],
  "staff.manage": [ROLES.OWNER],
  "staff.salary": [ROLES.OWNER],

  "notifications.view": [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER],
  "notifications.send": [ROLES.OWNER, ROLES.ADMIN],
  "notifications.send_to_own_groups": [ROLES.TEACHER],

  "tasks.view": [ROLES.OWNER, ROLES.ADMIN],
  "tasks.manage": [ROLES.OWNER, ROLES.ADMIN],

  "settings.basic": [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER, ROLES.ACCOUNTANT],
  "settings.branding": [ROLES.OWNER],
  "settings.finance": [ROLES.OWNER],
  "settings.roles": [ROLES.OWNER],
  "settings.integrations": [ROLES.OWNER],
  "settings.legal": [ROLES.OWNER],
  "settings.dangerous": [ROLES.OWNER],

  "profile.manage_own": [ROLES.TEACHER],

  "yagona.subscription.view": [ROLES.OWNER],
  "yagona.subscription.manage": [ROLES.OWNER],
  "yagona.contract.view": [ROLES.OWNER],
};

/** Education route segment → required capability */
export const SEGMENT_CAPABILITY = {
  "": "dashboard.view",
  crm: "crm.view",
  students: "students.view",
  trials: "trials.manage",
  courses: "courses.manage",
  groups: "groups.manage",
  rooms: "rooms.manage",
  teachers: "teachers.view",
  schedule: "schedule.manage",
  attendance: "attendance.manage",
  assignments: "assignments.view_own",
  results: "results.view_own",
  materials: "materials.view_own",
  billing: "payments.view",
  finance: "finance.view",
  staff: "staff.manage",
  notifications: "notifications.view",
  tasks: "tasks.view",
  settings: "settings.basic",
  profile: "profile.manage_own",
};

/** Dashboard is always reachable for authenticated education roles. */
CAPABILITIES["dashboard.view"] = [
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.TEACHER,
  ROLES.ACCOUNTANT,
];

/** Teacher uses own-group variants where applicable. */
CAPABILITIES["groups.manage"] = [ROLES.OWNER, ROLES.ADMIN];
CAPABILITIES["groups.view_own"] = [ROLES.TEACHER];
CAPABILITIES["schedule.manage"] = [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER];

/** Owner-only settings sections (admin uses AdminSettingsPage). */
export const ADMIN_BLOCKED_SETTINGS = new Set([
  "plan",
  "documents",
  "branding",
  "roles",
  "integrations",
]);

export function hasCapability(role, capability) {
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function isAdminRole(role) {
  return role === ROLES.ADMIN;
}

export function isOwnerRole(role) {
  return role === ROLES.OWNER;
}

export function isTeacherRole(role) {
  return role === ROLES.TEACHER;
}

/** Shared operational write access (CRM, students, courses, schedule, payments, etc.) */
export function canManageOperational(role) {
  return hasCapability(role, "crm.manage");
}

export function canAccessEducationSegment(role, segment = "") {
  const seg = String(segment || "").replace(/^\/+/, "");
  if (role === ROLES.TEACHER) {
    if (seg === "groups") return hasCapability(role, "groups.view_own");
    if (seg === "profile") return hasCapability(role, "profile.manage_own");
  }
  const capability = SEGMENT_CAPABILITY[seg];
  if (!capability) return role === ROLES.OWNER;
  return hasCapability(role, capability);
}

export function filterEducationNav(role, items = []) {
  return items.filter((item) => canAccessEducationSegment(role, item.segment));
}
