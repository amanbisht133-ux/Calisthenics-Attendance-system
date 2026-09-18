import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { TrainerLayout } from "@/components/layout/TrainerLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Login } from "@/pages/Login";

import { TrainerDashboard } from "@/pages/trainer/TrainerDashboard";
import { BatchAttendance } from "@/pages/trainer/BatchAttendance";
import { PTSessions } from "@/pages/trainer/PTSessions";
import { AllMembersAttendance } from "@/pages/trainer/AllMembersAttendance";
import { TrainerLeaderboard } from "@/pages/trainer/Leaderboard";

import { AdminOverview } from "@/pages/admin/AdminOverview";
import { Members } from "@/pages/admin/Members";
import { MemberProfile } from "@/pages/admin/MemberProfile";
import { Branches } from "@/pages/admin/Branches";
import { Batches } from "@/pages/admin/Batches";
import { Trainers } from "@/pages/admin/Trainers";
import { AttendanceLog } from "@/pages/admin/AttendanceLog";
import { DemoVisitors } from "@/pages/admin/DemoVisitors";
import { PTSessionsLog } from "@/pages/admin/PTSessionsLog";
import { ExpiredMemberships } from "@/pages/admin/ExpiredMemberships";
import { ExceptionReport } from "@/pages/admin/ExceptionReport";
import { Reports } from "@/pages/admin/Reports";
import { Reminders } from "@/pages/admin/Reminders";
import { AdminLeaderboard } from "@/pages/admin/Leaderboard";

function RoleRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={profile?.role === "admin" ? "/admin" : "/trainer"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RoleRedirect />} />

      <Route element={<ProtectedRoute allowRole="trainer" />}>
        <Route element={<TrainerLayout />}>
          <Route path="/trainer" element={<TrainerDashboard />} />
          <Route path="/trainer/batch/:batchId" element={<BatchAttendance />} />
          <Route path="/trainer/attendance" element={<AllMembersAttendance />} />
          <Route path="/trainer/pt" element={<PTSessions />} />
          <Route path="/trainer/leaderboard" element={<TrainerLeaderboard />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowRole="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/members" element={<Members />} />
          <Route path="/admin/members/:memberId" element={<MemberProfile />} />
          <Route path="/admin/branches" element={<Branches />} />
          <Route path="/admin/batches" element={<Batches />} />
          <Route path="/admin/trainers" element={<Trainers />} />
          <Route path="/admin/attendance" element={<AttendanceLog />} />
          <Route path="/admin/demo-visitors" element={<DemoVisitors />} />
          <Route path="/admin/pt-sessions" element={<PTSessionsLog />} />
          <Route path="/admin/expired" element={<ExpiredMemberships />} />
          <Route path="/admin/reminders" element={<Reminders />} />
          <Route path="/admin/leaderboard" element={<AdminLeaderboard />} />
          <Route path="/admin/exceptions" element={<ExceptionReport />} />
          <Route path="/admin/reports" element={<Reports />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
