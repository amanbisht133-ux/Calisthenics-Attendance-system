import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { BranchProvider, useBranch } from "@/context/BranchContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

const links = [
  { to: "/trainer", label: "Today", end: true },
  { to: "/trainer/attendance", label: "All Members", end: false },
  { to: "/trainer/pt", label: "PT Sessions", end: false },
  { to: "/trainer/leaderboard", label: "🏆 Leaderboard", end: false },
];

export function TrainerLayout() {
  return (
    <BranchProvider>
      <TrainerLayoutInner />
    </BranchProvider>
  );
}

function TrainerLayoutInner() {
  const { profile, signOut } = useAuth();
  const { branches, loading, selectedBranch } = useBranch();
  const [switching, setSwitching] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="min-h-screen bg-base-900">
      <header className="sticky top-0 z-20 border-b border-base-600 bg-base-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <div className="font-display text-lg font-bold text-accent-green">CalisthenicsHQ</div>
            <div className="text-xs text-white/50">
              Trainer · {profile?.full_name}
              {selectedBranch && <span className="text-white/30"> · {selectedBranch.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!loading && branches.length > 1 && (
              <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setSwitching(true)}>
                Switch Branch
              </button>
            )}
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setChangingPassword(true)}>
              Change Password
            </button>
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
        {selectedBranch && (
          <nav className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  clsx(
                    "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                    isActive ? "bg-accent-green text-base-900" : "text-white/60 hover:bg-base-700"
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        {loading ? (
          <p className="text-white/50">Loading…</p>
        ) : branches.length === 0 ? (
          <div className="card p-6 text-center text-white/50">
            You're not assigned to any branch yet. Ask an admin to assign you to one under Admin → Branches.
          </div>
        ) : !selectedBranch || switching ? (
          <BranchPicker onPicked={() => setSwitching(false)} />
        ) : (
          <Outlet />
        )}
      </main>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

function BranchPicker({ onPicked }: { onPicked: () => void }) {
  const { branches, selectBranch } = useBranch();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Choose a Branch</h1>
        <p className="text-sm text-white/50">You're assigned to more than one branch — pick which one you're working at.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map((b) => (
          <button
            key={b.id}
            className="card p-5 text-left transition-colors hover:border-accent-green/50"
            onClick={() => {
              selectBranch(b.id);
              onPicked();
            }}
          >
            <h3 className="text-lg font-bold">{b.name}</h3>
            <div className="mt-2 text-sm font-semibold text-accent-green">Continue →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
