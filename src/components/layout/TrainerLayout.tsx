import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";

const links = [
  { to: "/trainer", label: "Today", end: true },
  { to: "/trainer/pt", label: "PT Sessions", end: false },
];

export function TrainerLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-base-900">
      <header className="sticky top-0 z-20 border-b border-base-600 bg-base-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <div className="font-display text-lg font-bold text-accent-green">CalisthenicsHQ</div>
            <div className="text-xs text-white/50">Trainer · {profile?.full_name}</div>
          </div>
          <button className="btn-ghost !px-3 !py-2 text-xs" onClick={signOut}>
            Sign out
          </button>
        </div>
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
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
