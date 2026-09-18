import clsx from "clsx";
import type { RankingEntry } from "@/hooks/useLeaderboard";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Leaderboard({
  entries,
  isLoading,
  limit,
}: {
  entries: RankingEntry[] | undefined;
  isLoading: boolean;
  limit?: number;
}) {
  const shown = limit ? (entries ?? []).slice(0, limit) : entries ?? [];

  if (isLoading) return <p className="text-white/50">Loading rankings…</p>;

  if (shown.length === 0) {
    return <p className="py-4 text-center text-white/40">No attendance recorded yet this month.</p>;
  }

  return (
    <div className="divide-y divide-base-700">
      {shown.map((entry) => (
        <div key={entry.memberId} className="flex items-center gap-3 px-4 py-3">
          <span
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              entry.rank <= 3 ? "bg-accent-green/15 text-accent-green" : "bg-base-700 text-white/50"
            )}
          >
            {MEDALS[entry.rank] ?? `#${entry.rank}`}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{entry.memberName}</span>
          <span className="shrink-0 text-sm font-bold text-accent-green">
            {entry.count} session{entry.count === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}
