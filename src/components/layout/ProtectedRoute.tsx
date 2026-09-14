import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/database.types";

export function ProtectedRoute({ allowRole }: { allowRole?: UserRole }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-900">
        <div className="text-accent-green font-display text-lg animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (allowRole && profile && profile.role !== allowRole) {
    return <Navigate to={profile.role === "admin" ? "/admin" : "/trainer"} replace />;
  }

  return <Outlet />;
}
