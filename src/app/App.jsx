import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AuthLayout from "@/layouts/AuthLayout";
import EducationAdminLayout from "@/layouts/EducationAdminLayout";
import SuperAdminLayout from "@/layouts/SuperAdminLayout";
import LoginPage from "@/pages/auth/LoginPage";
import EduDashboardPage from "@/pages/education-admin/DashboardPage";
import CrmPage from "@/pages/education-admin/CrmPage";
import StudentsPage from "@/pages/education-admin/StudentsPage";
import CoursesPage from "@/pages/education-admin/CoursesPage";
import GroupsPage from "@/pages/education-admin/GroupsPage";
import SchedulePage from "@/pages/education-admin/SchedulePage";
import AttendancePage from "@/pages/education-admin/AttendancePage";
import BillingPage from "@/pages/education-admin/BillingPage";
import StaffPage from "@/pages/education-admin/StaffPage";
import NotificationsPage from "@/pages/education-admin/NotificationsPage";
import SettingsPage from "@/pages/education-admin/SettingsPage";
import SuperDashboardPage from "@/pages/super-admin/DashboardPage";
import CentersPage from "@/pages/super-admin/CentersPage";
import PlatformStudentsPage from "@/pages/super-admin/StudentsPage";
import LicensesPage from "@/pages/super-admin/LicensesPage";
import { APP_MODES } from "@/constants";
import { clearSession, setSession } from "@/services/api/client";
import {
  canAccessSuperAdmin,
  logout as doLogout,
} from "@/services/auth";
import {
  educationHomePath,
  findMembershipBySlug,
  parseEducationSlug,
  parseEducationSubdomain,
  resolveAuthedHome,
} from "@/utils/routes";

function RootRedirect({ session }) {
  const home = resolveAuthedHome(session);

  useEffect(() => {
    if (!home) clearSession();
  }, [home]);

  if (home) return <Navigate to={home} replace />;
  return null;
}

function AuthedLoginRedirect({ session }) {
  const home = resolveAuthedHome(session);

  useEffect(() => {
    if (!home || home === "/login") clearSession();
  }, [home]);

  if (home && home !== "/login") return <Navigate to={home} replace />;
  return null;
}

export default function App() {
  const session = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authed = Boolean(session.access && session.user);

  const urlSlug = parseEducationSlug(location.pathname);
  const hostSlug = parseEducationSubdomain(window.location.hostname);
  const activeSlug = urlSlug || hostSlug;

  useEffect(() => {
    if (session.access && !session.user) {
      clearSession();
    }
  }, [session.access, session.user]);

  useEffect(() => {
    if (!authed || !activeSlug) return;
    const membership = findMembershipBySlug(session, activeSlug);
    if (membership) {
      const needsSync =
        String(membership.tenant_id) !== String(session.tenantId || "") ||
        session.mode !== APP_MODES.EDUCATION_ADMIN ||
        String(session.tenantSlug || "").toLowerCase() !== activeSlug;
      if (needsSync) {
        setSession({
          tenantId: String(membership.tenant_id),
          tenantSlug: activeSlug,
          mode: APP_MODES.EDUCATION_ADMIN,
        });
      }
      return;
    }
    if (
      session.user?.is_superuser &&
      String(session.tenantSlug || "").toLowerCase() === activeSlug &&
      session.tenantId &&
      session.mode !== APP_MODES.EDUCATION_ADMIN
    ) {
      setSession({ mode: APP_MODES.EDUCATION_ADMIN });
    }
  }, [
    authed,
    activeSlug,
    session.mode,
    session.tenantId,
    session.tenantSlug,
    session.user?.is_superuser,
    session.memberships,
  ]);

  useEffect(() => {
    if (!authed || !hostSlug || urlSlug) return;
    if (location.pathname === "/" || location.pathname.startsWith("/login")) {
      navigate(educationHomePath(hostSlug), { replace: true });
    }
  }, [authed, hostSlug, urlSlug, location.pathname, navigate]);

  async function onLogout() {
    await doLogout();
    navigate("/login", { replace: true });
  }

  if (!authed) {
    return (
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RootRedirect session={session} />} />

      <Route element={<SuperAdminLayout session={session} onLogout={onLogout} />}>
        <Route
          path="/super"
          element={
            canAccessSuperAdmin(session) ? (
              <SuperDashboardPage />
            ) : (
              <Navigate to={resolveAuthedHome(session) || "/login"} replace />
            )
          }
        />
        <Route
          path="/super/centers"
          element={canAccessSuperAdmin(session) ? <CentersPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/super/students"
          element={
            canAccessSuperAdmin(session) ? (
              <PlatformStudentsPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/licenses"
          element={
            canAccessSuperAdmin(session) ? <LicensesPage /> : <Navigate to="/login" replace />
          }
        />
      </Route>

      <Route
        path="/education/:tenantSlug"
        element={<EducationAdminLayout session={session} onLogout={onLogout} />}
      >
        <Route index element={<EduDashboardPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/login" element={<AuthedLoginRedirect session={session} />} />
      <Route path="*" element={<RootRedirect session={session} />} />
    </Routes>
  );
}
