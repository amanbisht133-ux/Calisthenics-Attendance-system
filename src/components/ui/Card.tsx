import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card p-5", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  accent = "green",
}: {
  label: string;
  value: string | number;
  accent?: "green" | "orange" | "red";
}) {
  const accentColor =
    accent === "green" ? "text-accent-green" : accent === "orange" ? "text-accent-orange" : "text-status-expired";

  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
      <div className={clsx("mt-2 font-display text-3xl font-bold", accentColor)}>{value}</div>
    </Card>
  );
}
