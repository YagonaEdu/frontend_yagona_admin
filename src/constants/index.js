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
  admin: "Администратор",
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
    { segment: "trials", label: "Пробные уроки", group: "Учёба" },
    { segment: "courses", label: "Курсы", group: "Учёба" },
    { segment: "groups", label: "Группы", group: "Учёба" },
    { segment: "rooms", label: "Кабинеты", group: "Учёба" },
    { segment: "teachers", label: "Преподаватели", group: "Учёба" },
    { segment: "schedule", label: "Расписание", group: "Учёба" },
    { segment: "attendance", label: "Посещаемость", group: "Учёба" },
    { segment: "billing", label: "Биллинг", group: "Финансы" },
    { segment: "finance", label: "Финансы", group: "Финансы" },
    { segment: "staff", label: "Команда", group: "Управление" },
    { segment: "tasks", label: "Задачи", group: "Управление" },
    { segment: "notifications", label: "Уведомления", group: "Управление" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
  admin: [
    { segment: "", label: "Главная", end: true, group: "Обзор" },
    { segment: "crm", label: "CRM", group: "Клиенты" },
    { segment: "students", label: "Ученики", group: "Клиенты" },
    { segment: "trials", label: "Пробные уроки", group: "Клиенты" },
    { segment: "courses", label: "Курсы", group: "Обучение" },
    { segment: "groups", label: "Группы", group: "Обучение" },
    { segment: "rooms", label: "Кабинеты", group: "Обучение" },
    { segment: "teachers", label: "Преподаватели", group: "Обучение" },
    { segment: "schedule", label: "Расписание", group: "Обучение" },
    { segment: "attendance", label: "Посещаемость", group: "Обучение" },
    { segment: "billing", label: "Платежи", group: "Финансы" },
    { segment: "notifications", label: "Уведомления", group: "Работа" },
    { segment: "tasks", label: "Задачи", group: "Работа" },
    { segment: "settings", label: "Настройки", group: "Система" },
  ],
  accountant: [
    { segment: "", label: "Обзор", end: true, group: "Главное" },
    { segment: "students", label: "Ученики", group: "Главное" },
    { segment: "billing", label: "Биллинг", group: "Финансы" },
    { segment: "finance", label: "Финансы", group: "Финансы" },
    { segment: "settings", label: "Настройки", group: "Управление" },
  ],
  teacher: [
    { segment: "", label: "Мой день", end: true, group: "Главная" },
    { segment: "groups", label: "Мои группы", group: "Обучение" },
    { segment: "students", label: "Мои ученики", group: "Обучение" },
    { segment: "schedule", label: "Расписание", group: "Обучение" },
    { segment: "attendance", label: "Посещаемость", group: "Обучение" },
    { segment: "assignments", label: "Задания", group: "Учебный процесс" },
    { segment: "results", label: "Результаты", group: "Учебный процесс" },
    { segment: "materials", label: "Материалы", group: "Учебный процесс" },
    { segment: "notifications", label: "Уведомления", group: "Связь" },
    { segment: "profile", label: "Профиль", group: "Система" },
  ],
};

export const SUPER_ADMIN_NAV = [
  { to: "/super", label: "Обзор", end: true, group: "Платформа" },
  { to: "/super/centers", label: "Центры", group: "Платформа" },
  { to: "/super/students", label: "Ученики", group: "Платформа" },
  { to: "/super/plans", label: "Тарифы", group: "Биллинг" },
  { to: "/super/licenses", label: "Лицензии", group: "Биллинг" },
  { to: "/super/wallet", label: "Кошелёк", group: "Биллинг" },
  { to: "/super/analytics", label: "Аналитика", group: "Аналитика" },
];
