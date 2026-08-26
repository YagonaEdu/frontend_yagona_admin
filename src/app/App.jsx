import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import PageFallback from "@/components/layout/PageFallback";
import { useAuth } from "@/hooks/useAuth";
import AuthLayout from "@/layouts/AuthLayout";
import EducationAdminLayout from "@/layouts/EducationAdminLayout";
import SuperAdminLayout from "@/layouts/SuperAdminLayout";
import LoginPage from "@/pages/auth/LoginPage";
import { APP_MODES } from "@/constants";
import { clearSession, setSession } from "@/services/api/client";
import {
  canAccessSuperAdmin,
  currentMembership,
  logout as doLogout,
} from "@/services/auth";
import {
  educationHomePath,
  findMembershipBySlug,
  parseEducationSlug,
  parseEducationSubdomain,
  resolveAuthedHome,
} from "@/utils/routes";
import { canAccessEducationSegment, isTeacherRole } from "@/utils/roleAccess";

const EduDashboardPage = lazy(() => import("@/pages/education-admin/DashboardPage"));
const CrmPage = lazy(() => import("@/pages/education-admin/CrmPage"));
const StudentsPage = lazy(() => import("@/pages/education-admin/StudentsPage"));
const CoursesPage = lazy(() => import("@/pages/education-admin/CoursesPage"));
const GroupsPage = lazy(() => import("@/pages/education-admin/GroupsPage"));
const RoomsPage = lazy(() => import("@/pages/education-admin/RoomsPage"));
const SchedulePage = lazy(() => import("@/pages/education-admin/SchedulePage"));
const AttendancePage = lazy(() => import("@/pages/education-admin/AttendancePage"));
const BillingPage = lazy(() => import("@/pages/education-admin/BillingPage"));
const FinancePage = lazy(() => import("@/pages/education-admin/FinancePage"));
const StaffPage = lazy(() => import("@/pages/education-admin/StaffPage"));
const NotificationsPage = lazy(() => import("@/pages/education-admin/NotificationsPage"));
const SettingsPage = lazy(() => import("@/pages/education-admin/SettingsPage"));
const ReceptionTasksPage = lazy(() => import("@/pages/education-admin/resepshen_yagona/TasksPage"));
const TeachersPage = lazy(() => import("@/pages/education-admin/resepshen_yagona/TeachersPage"));
const TrialsPage = lazy(() => import("@/pages/education-admin/resepshen_yagona/TrialsPage"));
const TeacherDashboard = lazy(() => import("@/pages/education-admin/teachers_account"));
const TeacherGroupsPage = lazy(() => import("@/pages/education-admin/teachers_account/GroupsPage"));
const TeacherStudentsPage = lazy(() => import("@/pages/education-admin/teachers_account/StudentsPage"));
const TeacherSchedulePage = lazy(() => import("@/pages/education-admin/teachers_account/SchedulePage"));
const TeacherAttendancePage = lazy(() => import("@/pages/education-admin/teachers_account/AttendancePage"));
const TeacherAssignmentsPage = lazy(() => import("@/pages/education-admin/teachers_account/AssignmentsPage"));
const TeacherResultsPage = lazy(() => import("@/pages/education-admin/teachers_account/ResultsPage"));
const TeacherMaterialsPage = lazy(() => import("@/pages/education-admin/teachers_account/MaterialsPage"));
const TeacherNotificationsPage = lazy(() => import("@/pages/education-admin/teachers_account/NotificationsPage"));
const TeacherProfilePage = lazy(() => import("@/pages/education-admin/teachers_account/ProfilePage"));
const SuperDashboardPage = lazy(() => import("@/pages/super-admin/DashboardPage"));
const CentersPage = lazy(() => import("@/pages/super-admin/CentersPage"));
const PlatformStudentsPage = lazy(() => import("@/pages/super-admin/StudentsPage"));
const PlansPage = lazy(() => import("@/pages/super-admin/PlansPage"));
const LicensesPage = lazy(() => import("@/pages/super-admin/LicensesPage"));
const WalletPage = lazy(() => import("@/pages/super-admin/WalletPage"));
const AnalyticsPage = lazy(() => import("@/pages/super-admin/AnalyticsPage"));

function LazyPage({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function RoleGuard({ session, segment, children }) {
  const membership = findMembershipBySlug(
    session,
    parseEducationSlug(window.location.pathname),
  ) || currentMembership(session);
  const role = membership?.role || "owner";
  if (!canAccessEducationSegment(role, segment)) {
    return <Navigate to={educationHomePath(membership?.tenant_slug || "")} replace />;
  }
  return children;
}

function TeacherSwitch({ session, teacher, children }) {
  const membership = findMembershipBySlug(
    session,
    parseEducationSlug(window.location.pathname),
  ) || currentMembership(session);
  if (isTeacherRole(membership?.role || "")) {
    return teacher;
  }
  return children;
}

function RootRedirect({ session }) {
  const home = resolveAuthedHome(session);

  useEffect(() => {
    if (home) return;
    if (!session.access || !session.user) return;
    if (session.user.is_superuser) return;
    if (!Array.isArray(session.memberships) || session.memberships.length > 0) return;
    clearSession();
  }, [home, session.access, session.user, session.memberships]);

  if (home) return <Navigate to={home} replace />;
  return <Navigate to="/login" replace />;
}

function AuthedLoginRedirect({ session }) {
  const home = resolveAuthedHome(session);
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
    const onAuthExpired = () => {
      navigate("/login", { replace: true });
    };
    window.addEventListener("yagona-auth-expired", onAuthExpired);
    return () => window.removeEventListener("yagona-auth-expired", onAuthExpired);
  }, [navigate]);

  useEffect(() => {
    if (session.access && !session.user) {
      clearSession();
    }
  }, [session.access, session.user]);

  const membershipIdsKey = (session.memberships || [])
    .map((item) => `${item.id}:${item.tenant_slug}`)
    .join("|");

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
    // membershipIdsKey tracks membership identity without depending on array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authed,
    activeSlug,
    session.mode,
    session.tenantId,
    session.tenantSlug,
    session.user?.is_superuser,
    membershipIdsKey,
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
              <LazyPage>
                <SuperDashboardPage />
              </LazyPage>
            ) : (
              <Navigate to={resolveAuthedHome(session) || "/login"} replace />
            )
          }
        />
        <Route
          path="/super/centers"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <CentersPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/students"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <PlatformStudentsPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/plans"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <PlansPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/licenses"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <LicensesPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/wallet"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <WalletPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/super/analytics"
          element={
            canAccessSuperAdmin(session) ? (
              <LazyPage>
                <AnalyticsPage />
              </LazyPage>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Route>

      <Route
        path="/education/:tenantSlug"
        element={<EducationAdminLayout session={session} onLogout={onLogout} />}
      >
        <Route
          index
          element={
            <RoleGuard session={session} segment="">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherDashboard />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <EduDashboardPage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="crm"
          element={
            <RoleGuard session={session} segment="crm">
              <LazyPage>
                <CrmPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="students"
          element={
            <RoleGuard session={session} segment="students">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherStudentsPage />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <StudentsPage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="trials"
          element={
            <RoleGuard session={session} segment="trials">
              <LazyPage>
                <TrialsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="courses"
          element={
            <RoleGuard session={session} segment="courses">
              <LazyPage>
                <CoursesPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="groups"
          element={
            <RoleGuard session={session} segment="groups">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherGroupsPage />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <GroupsPage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="rooms"
          element={
            <RoleGuard session={session} segment="rooms">
              <LazyPage>
                <RoomsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="teachers"
          element={
            <RoleGuard session={session} segment="teachers">
              <LazyPage>
                <TeachersPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="schedule"
          element={
            <RoleGuard session={session} segment="schedule">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherSchedulePage />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <SchedulePage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="attendance"
          element={
            <RoleGuard session={session} segment="attendance">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherAttendancePage />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <AttendancePage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="assignments"
          element={
            <RoleGuard session={session} segment="assignments">
              <LazyPage>
                <TeacherAssignmentsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="results"
          element={
            <RoleGuard session={session} segment="results">
              <LazyPage>
                <TeacherResultsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="materials"
          element={
            <RoleGuard session={session} segment="materials">
              <LazyPage>
                <TeacherMaterialsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="billing"
          element={
            <RoleGuard session={session} segment="billing">
              <LazyPage>
                <BillingPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="finance"
          element={
            <RoleGuard session={session} segment="finance">
              <LazyPage>
                <FinancePage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="staff"
          element={
            <RoleGuard session={session} segment="staff">
              <LazyPage>
                <StaffPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="notifications"
          element={
            <RoleGuard session={session} segment="notifications">
              <TeacherSwitch
                session={session}
                teacher={
                  <LazyPage>
                    <TeacherNotificationsPage />
                  </LazyPage>
                }
              >
                <LazyPage>
                  <NotificationsPage />
                </LazyPage>
              </TeacherSwitch>
            </RoleGuard>
          }
        />
        <Route
          path="tasks"
          element={
            <RoleGuard session={session} segment="tasks">
              <LazyPage>
                <ReceptionTasksPage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="profile"
          element={
            <RoleGuard session={session} segment="profile">
              <LazyPage>
                <TeacherProfilePage />
              </LazyPage>
            </RoleGuard>
          }
        />
        <Route
          path="settings"
          element={
            <RoleGuard session={session} segment="settings">
              <LazyPage>
                <SettingsPage />
              </LazyPage>
            </RoleGuard>
          }
        />
      </Route>

      <Route path="/login" element={<AuthedLoginRedirect session={session} />} />
      <Route path="*" element={<RootRedirect session={session} />} />
    </Routes>
  );
}
