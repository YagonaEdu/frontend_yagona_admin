# Yagona Admin (`frontendyagona`)

Единый frontend с двумя административными режимами.

## Режимы

| Режим | Код | Кто | Доступ |
|---|---|---|---|
| Super Admin | `yagona_super_admin` | владельцы платформы Yagona | `user.is_superuser === true` |
| Education Admin | `yagona_education_admin` | staff учебного центра | роли `owner`, `admin`, `teacher`, `accountant` |

## Запуск

```powershell
npm install
npm run dev
```

API по умолчанию: `http://127.0.0.1:8000/api/v1`  
Переопределение: `VITE_API_BASE`

## Архитектура

```
src/
  app/                 # App router
  components/
    ui/                # общие Banner, Table, StatCard, Button, Badge…
    forms/             # TextField, PasswordField, SelectField
    layout/            # переиспользуемые куски layout
  constants/           # роли, nav, labels
  hooks/               # useAuth
  layouts/             # SuperAdminLayout, EducationAdminLayout, AuthLayout
  pages/
    auth/
    super-admin/       # центры, лицензии, ученики платформы
    education-admin/   # CRM/ERP центра
  services/
    api/               # HTTP client (без завершающего /)
    auth/              # login/logout/session helpers
    tenant/            # platform tenants + switch mode
  utils/
  styles.css
```

Общие UI-компоненты **не дублируются** между двумя админками.
