import clsx from "clsx";
import { daysUntil, formatDate, formatRupees } from "@/lib/utils";

/**
 * The only things a trainer needs to act on, shown as short pills:
 * an expired package (nudge to renew), one ending within a week, or money owed.
 * Members in good standing show nothing at all.
 */
export function MemberFlags({ expiryDate, due }: { expiryDate: string; due?: number }) {
  const days = daysUntil(expiryDate);
  const flags: { text: string; tone: "red" | "amber" }[] = [];

  if (days < 0) flags.push({ text: `Expired ${formatDate(expiryDate, "d MMM")} · ask to renew`, tone: "red" });
  else if (days === 0) flags.push({ text: "Package ends today", tone: "amber" });
  else if (days <= 7) flags.push({ text: `Renews in ${days} day${days === 1 ? "" : "s"}`, tone: "amber" });

  if (due && due > 0) flags.push({ text: `${formatRupees(due)} due`, tone: "red" });

  if (flags.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span
          key={f.text}
          className={clsx(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
            f.tone === "red" ? "bg-status-expired/15 text-status-expired" : "bg-status-expiring/15 text-status-expiring"
          )}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}

/** True when the trainer should say something to this member. */
export function needsNudge(expiryDate: string, due?: number): boolean {
  return daysUntil(expiryDate) < 0 || (!!due && due > 0);
}
