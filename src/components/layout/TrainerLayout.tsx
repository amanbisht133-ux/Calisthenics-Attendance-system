import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { BranchProvider, useBranch } from "@/context/BranchContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { usePTClients } from "@/hooks/useTrainerData";

export function TrainerLayout() {
  return (
    <BranchProvider>
      <TrainerLayoutInner />
    </BranchProvider>
  );
}

function branchLabel(name: string | undefined): string {
  if (!name) return "";
  if (name.toLowerCase() === "cali") return "Calisthenics Lab India";
  if (name.toLowerCase() === "ics") return "Indian Calisthenics School";
  return name;
}

function TrainerLayoutInner() {
  const { profile, signOut } = useAuth();
  const { branches, loading, selectedBranch, selectedBranchId } = useBranch();
  const { data: ptClients } = usePTClients(profile?.id, selectedBranchId ?? undefined);
  const [switching, setSwitching] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasPT = (ptClients?.length ?? 0) > 0;

  const tabs = [
    { to: "/trainer", label: "Attendance", icon: "✓", end: true },
    ...(hasPT ? [{ to: "/trainer/pt", label: "Personal training", icon: "★", end: false }] : []),
  ];

  return (
    <div className="min-h-screen bg-base-900">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base-900/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="font-display text-2xl leading-none tracking-wider">
              Calisthenics<span className="ember-text">HQ</span>
            </div>
            {selectedBranch && (
              <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/45">
                {branchLabel(selectedBranch.name)}
              </div>
            )}
          </div>
          <button
            className="flex h-10 items-center gap-2 rounded-full border border-white/10 pl-1 pr-3 text-sm text-white/80"
            onClick={() => setMenuOpen(true)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
              {(profile?.full_name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            {profile?.full_name?.split(" ")[0]}
          </button>
        </div>
        {tabs.length > 1 && (
          <nav className="mx-auto hidden max-w-2xl gap-1 px-4 pb-2 sm:flex">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-1.5 text-sm font-semibold",
                    isActive ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {loading ? (
          <p className="text-white/50">Loading…</p>
        ) : branches.length === 0 ? (
          <div className="card p-6 text-center text-white/50">
            You're not linked to an academy yet. Ask Aman to add you under Trainers.
          </div>
        ) : !selectedBranch || switching ? (
          <BranchPicker onPicked={() => setSwitching(false)} />
        ) : (
          <Outlet />
        )}
      </main>

      {/* Bottom tabs on phones, only when there is more than one thing to do */}
      {tabs.length > 1 && selectedBranch && !switching && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-base-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-2xl">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider",
                    isActive ? "text-accent-green" : "text-white/45"
                  )
                }
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full max-w-md space-y-2 rounded-t-3xl border border-white/10 bg-base-800 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            <div className="pb-2">
              <div className="font-semibold">{profile?.full_name}</div>
              <div className="text-xs text-white/45">{profile?.email}</div>
            </div>
            {branches.length > 1 && (
              <button
                className="btn-secondary w-full !justify-start !py-3"
                onClick={() => {
                  setSwitching(true);
                  setMenuOpen(false);
                }}
              >
                Switch academy
              </button>
            )}
            <button
              className="btn-secondary w-full !justify-start !py-3"
              onClick={() => {
                setChangingPassword(true);
                setMenuOpen(false);
              }}
            >
              Change password
            </button>
            <button className="btn-ghost w-full !justify-start !py-3 text-status-expired" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

function BranchPicker({ onPicked }: { onPicked: () => void }) {
  const { branches, selectBranch } = useBranch();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl leading-none">Where are you today?</h1>
        <p className="mt-1 text-sm text-white/50">Pick the academy you're coaching at.</p>
      </div>
      <div className="grid gap-3">
        {branches.map((b) => (
          <button
            key={b.id}
            className="card p-5 text-left transition-colors hover:border-accent-green/50 active:scale-[0.99]"
            onClick={() => {
              selectBranch(b.id);
              onPicked();
            }}
          >
            <div className="font-display text-2xl leading-none tracking-wide">{branchLabel(b.name)}</div>
            <div className="mt-2 text-sm font-semibold text-accent-green">Continue →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
