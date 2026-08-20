export const APP_MODES = {
  SUPER_ADMIN: "yagona_super_admin",
  EDUCATION_ADMIN: "yagona_education_admin",
};

export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  TEACHER: "teacher",
  ACCOUNTANT: "accountant",
  STUDENT: "student",
};

export const ROLE_LABELS = {
  owner: "Владелец",
  admin: "Админ",
  teacher: "Преподаватель",
  accountant: "Бухгалтер",
  student: "Студент",
};

export const PLAN_LABELS = {
  trial: "Пробный",
  start: "Старт",
  business: "Бизнес",
};

export const CYCLE_LABELS = {
  monthly: "месяц",
  yearly: "год",
};

export const LICENSE_LABELS = {
  active: "оплачен",
  trial: "пробный",
  expired: "истёк",
  suspended: "отключён",
};

export const STUDENT_STATUS_LABELS = {
  active: "активен",
  inactive: "неактивен",
  archived: "архив",
};

export const BILLING_TYPE_LABELS = {
  lessons: "пакет уроков",
  monthly: "месячный",
};

/** Human labels for every status value rendered in badges. */
export const STATUS_LABELS = {
  active: "активен",
  inactive: "неактивен",
  archived: "архив",
  draft: "черновик",
  issued: "выставлен",
  paid: "оплачен",
  partially_paid: "частично оплачен",
  overdue: "просрочен",
  canceled: "отменён",
  cancelled: "отменён",
  refunded: "возврат",
  present: "был",
  absent: "не был",
  late: "опоздал",
  excused: "уважительная",
  planned: "запланирован",
  scheduled: "запланирован",
  ongoing: "идёт",
  completed: "проведён",
  queued: "в очереди",
  sending: "отправляется",
  sent: "отправлено",
  delivered: "доставлено",
  failed: "ошибка",
  succeeded: "успешно",
  pending: "в ожидании",
  new: "новый",
  contacted: "на связи",
  won: "успех",
  lost: "отказ",
  trial: "пробный",
  expired: "истёк",
  suspended: "отключён",
};

/** Navigation for education center by role (segment after /education/:slug/) */
export const EDUCATION_NAV = {
  owner: [
    { segment: "", label: "Обзор", end: true, group: "Главное" },
    { segment: "crm", label: "CRM", group: "Главное" },
    { segment: "students", label: "Ученики", group: "Учёба" },
    { segment: "courses", label: "Курсы", group: "Учёба" },
    { segment: "groups", label: "Группы", group: "Учёба" },
    { segment: "schedule", label: "Расписание", group: "Учёба" },
    { segment: "attendance", label: "Посещаемость", group: "Учёба" },
    { segment: "billing", label: "Биллинг", group: "Финансы" },
    { segment: "staff", label: "Команда", group: "Управление" },
    { segment: "notifications", label: "Уведомления", group: "Управление" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
  admin: [
    { segment: "", label: "Обзор", end: true, group: "Главное" },
    { segment: "crm", label: "CRM", group: "Главное" },
    { segment: "students", label: "Ученики", group: "Учёба" },
    { segment: "courses", label: "Курсы", group: "Учёба" },
    { segment: "groups", label: "Группы", group: "Учёба" },
    { segment: "schedule", label: "Расписание", group: "Учёба" },
    { segment: "attendance", label: "Посещаемость", group: "Учёба" },
    { segment: "billing", label: "Биллинг", group: "Финансы" },
    { segment: "staff", label: "Команда", group: "Управление" },
    { segment: "notifications", label: "Уведомления", group: "Управление" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
  accountant: [
    { segment: "", label: "Обзор", end: true, group: "Главное" },
    { segment: "students", label: "Ученики", group: "Главное" },
    { segment: "billing", label: "Биллинг", group: "Финансы" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
  teacher: [
    { segment: "", label: "Обзор", end: true, group: "Главное" },
    { segment: "students", label: "Ученики", group: "Учёба" },
    { segment: "groups", label: "Группы", group: "Учёба" },
    { segment: "schedule", label: "Расписание", group: "Учёба" },
    { segment: "attendance", label: "Посещаемость", group: "Учёба" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
};

export const SUPER_ADMIN_NAV = [
  { to: "/super", label: "Обзор", end: true, group: "Платформа" },
  { to: "/super/centers", label: "Центры", group: "Платформа" },
  { to: "/super/students", label: "Ученики", group: "Платформа" },
  { to: "/super/licenses", label: "Лицензии", group: "Платформа" },
];
