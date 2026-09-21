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
  const [navOpen, setNavOpen] = useState(false);

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
            <div className="font-display text-lg font-bold text-accent-green">CalisthenicsHQ</div>
            <div className="text-xs text-white/50">
              Trainer · {profile?.full_name}
              {selectedBranch && <span className="text-white/30"> · {selectedBranch.name}</span>}
            </div>
          </div>
          <button className="text-white/50 lg:hidden" onClick={() => setNavOpen(false)}>
            ✕
          </button>
        </div>

        {selectedBranch && (
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
        )}

        <div className="mt-auto shrink-0 border-t border-base-600 px-5 py-4">
          {!loading && branches.length > 1 && (
            <button
              className="btn-ghost mb-2 w-full !px-3 !py-2 text-xs"
              onClick={() => {
                setSwitching(true);
                setNavOpen(false);
              }}
            >
              Switch Branch
            </button>
          )}
          <button className="btn-ghost w-full !px-3 !py-2 text-xs" onClick={() => setChangingPassword(true)}>
            Change Password
          </button>
          <button className="btn-ghost mt-2 w-full !px-3 !py-2 text-xs" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      {navOpen && <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-600 bg-base-900/90 px-4 py-3 backdrop-blur lg:hidden">
          <button className="btn-ghost !px-2.5 !py-2" onClick={() => setNavOpen(true)}>
            ☰
          </button>
          <div className="font-display font-bold text-accent-green">CalisthenicsHQ</div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6 pb-16 lg:px-8">
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
      </div>

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
