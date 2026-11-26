import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { fetchAcademies, inr, kindLabel, type AcademySetting, type RenewalDue } from "@/lib/renewals";

/** CLI | ICS switch. One academy on screen at a time, never mixed. */
export function useAcademyPicker() {
  const { data: academies = [] } = useQuery({ queryKey: ["academy-settings"], queryFn: fetchAcademies });
  const [code, setCode] = useState<string>(() => {
    try {
      return localStorage.getItem("renewals-academy") ?? "CLI";
    } catch {
      return "CLI";
    }
  });
  const academy: AcademySetting | undefined = academies.find((a) => a.code === code) ?? academies[0];
  function pick(c: string) {
    setCode(c);
    try {
      localStorage.setItem("renewals-academy", c);
    } catch {
      /* best effort */
    }
  }
  const tabs = (
    <div className="flex rounded-full border border-white/10 bg-base-800 p-1">
      {academies.map((a) => (
        <button
          key={a.code}
          onClick={() => pick(a.code)}
          className={clsx(
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            academy?.code === a.code ? "bg-accent-green text-base-900" : "text-white/60"
          )}
        >
          {a.code === "CLI" ? "Calisthenics Lab" : "ICS"}
        </button>
      ))}
    </div>
  );
  return { academy, tabs, academies };
}

export function Section({ title, hint, count, tone, children }: { title: string; hint?: string; count: number; tone: string; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className={clsx("text-xl", tone)}>
          {title} <span className="text-white/40">· {count}</span>
        </h2>
        {hint && <span className="text-xs text-white/40">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const kindTone: Record<string, string> = {
  installment: "bg-sky-400/15 text-sky-300",
  expired: "bg-status-expired/15 text-status-expired",
  ending_soon: "bg-status-expiring/15 text-status-expiring",
};

export function DueHeader({ due, right }: { due: RenewalDue; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {due.member_name}
          {due.is_test && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/60">test</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/50">
          <span className={clsx("rounded-full px-2 py-0.5 font-semibold", kindTone[due.due_kind])}>{kindLabel(due)}</span>
          <span>
            {Number(due.package_months)}m · {due.package_label ?? "—"}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-2xl leading-none">{inr(due.amount_due)}</div>
        {right}
      </div>
    </div>
  );
}

export function ReportTiles({
  report,
}: {
  report: { renewed: { count: number; amount: number }; pending: { count: number; amount: number }; promised: { count: number; amount: number }; leaving: { count: number; amount: number } };
}) {
  const tiles = [
    { k: "Renewed", v: report.renewed, c: "text-status-active", bar: "bg-status-active" },
    { k: "Pending", v: report.pending, c: "text-accent-green", bar: "bg-accent-green" },
    { k: "Promised", v: report.promised, c: "text-sky-300", bar: "bg-sky-400" },
    { k: "Possibly leaving", v: report.leaving, c: "text-status-expired", bar: "bg-status-expired" },
  ];
  const total = tiles.reduce((a, t) => a + t.v.count, 0) || 1;
  return (
    <div className="card space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/45">This week</div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
        {tiles.map((t) => (
          <div key={t.k} className={t.bar} style={{ width: `${(t.v.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl bg-base-700/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{t.k}</div>
            <div className={clsx("font-display text-3xl leading-none", t.c)}>{t.v.count}</div>
            <div className="text-xs text-white/45">{inr(t.v.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WaButton({ href, label, onTap, tone = "primary" }: { href: string | null; label: string; onTap?: () => void; tone?: "primary" | "secondary" }) {
  if (!href) return <span className="text-xs text-white/40">No phone number</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onTap}
      className={clsx(tone === "primary" ? "btn-primary" : "btn-secondary", "w-full !py-3")}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.1-4.7-4-4.9-4.2-.1-.2-1.2-1.6-1.2-3s.7-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.1.1.6-.1 1.2Z" />
      </svg>
      {label}
    </a>
  );
}
