import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

const links = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/members", label: "Members" },
  { to: "/admin/branches", label: "Branches" },
  { to: "/admin/batches", label: "Batches" },
  { to: "/admin/trainers", label: "Trainers" },
  { to: "/admin/attendance", label: "Attendance Log" },
  { to: "/admin/demo-visitors", label: "Demo Visitors" },
  { to: "/admin/pt-sessions", label: "PT Sessions" },
  { to: "/admin/expired", label: "Expired Memberships" },
  { to: "/admin/reminders", label: "Reminders" },
  { to: "/admin/leaderboard", label: "🏆 Leaderboard" },
  { to: "/admin/exceptions", label: "Exception Report" },
  { to: "/admin/reports", label: "Reports" },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="min-h-screen bg-base-900 lg:flex">
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col border-r border-base-600 bg-base-800 transition-transform lg:static lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-5">
          <div>
            <div className="font-display text-xl font-bold text-accent-green">CalisthenicsHQ</div>
            <div className="text-xs text-white/50">Admin Console</div>
          </div>
          <button className="text-white/50 lg:hidden" onClick={() => setNavOpen(false)}>
            ✕
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                clsx(
                  "rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  isActive ? "bg-accent-green text-base-900" : "text-white/60 hover:bg-base-700 hover:text-white"
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-base-600 px-5 py-4">
          <div className="text-sm font-semibold text-white">{profile?.full_name}</div>
          <div className="text-xs text-white/50">{profile?.email}</div>
          <button className="btn-ghost mt-3 w-full !px-3 !py-2 text-xs" onClick={() => setChangingPassword(true)}>
            Change Password
          </button>
          <button className="btn-ghost mt-2 w-full !px-3 !py-2 text-xs" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}

      {navOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)} />
      )}

      <div className="flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-600 bg-base-900/90 px-4 py-3 backdrop-blur lg:hidden">
          <button className="btn-ghost !px-2.5 !py-2" onClick={() => setNavOpen(true)}>
            ☰
          </button>
          <div className="font-display font-bold text-accent-green">CalisthenicsHQ</div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
