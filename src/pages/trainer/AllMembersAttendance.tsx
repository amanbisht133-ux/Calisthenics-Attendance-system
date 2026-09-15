import { useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useAllMembers } from "@/hooks/useTrainerData";
import { useAttendanceSync } from "@/hooks/useAttendanceSync";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchBar } from "@/components/ui/SearchBar";
import { todayISO, formatDate } from "@/lib/utils";
import type { MemberWithStatus } from "@/lib/database.types";

type MemberWithBatch = MemberWithStatus & {
  batchId: string | null;
  member_batches: { batch_id: string }[];
};

export function AllMembersAttendance() {
  const { profile } = useAuth();
  const { data: members, isLoading: membersLoading } = useAllMembers();
  const {
    savedEntries,
    savedLoading,
    presentIds,
    toggle,
    flush,
    syncing,
    syncError,
    justSaved,
    pendingCount,
  } = useAttendanceSync(profile?.id);

  const [search, setSearch] = useState("");

  const filtered = ((members ?? []) as MemberWithBatch[]).filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-white/50">
          {formatDate(todayISO(), "EEEE, dd MMM yyyy")}
        </p>
        {savedEntries.size > 0 && (
          <p className="mt-1 text-xs text-accent-green">
            ✓ {savedEntries.size} member{savedEntries.size !== 1 ? "s" : ""} already saved today
          </p>
        )}
        <p className="mt-1 text-xs text-white/30">
          Tap a member to toggle present/absent — today's attendance can be corrected any time before end of day.
        </p>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />

      {/* Member list */}
      {membersLoading || savedLoading ? (
        <p className="text-white/50">Loading members…</p>
      ) : (
        <div className="card divide-y divide-base-700">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-white/40">
              No members match "{search}"
            </div>
          )}

          {filtered.map((member) => {
            const m = member as MemberWithBatch;
            const isPresent = presentIds.has(m.id);
            const noBatch = !m.batchId && !savedEntries.has(m.id);

            return (
              <div
                key={m.id}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  isPresent && "bg-accent-green/5",
                  m.status === "expired" && !isPresent && "bg-status-expired/5"
                )}
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      "truncate font-semibold",
                      m.status === "expired" && !isPresent && "text-status-expired"
                    )}
                  >
                    {m.status === "expired" && !isPresent && "⚠️ "}
                    {m.name}
                  </div>
                  <div className="text-xs text-white/40">{m.phone}</div>
                  {noBatch && (
                    <div className="text-xs text-yellow-500/70">No batch assigned</div>
                  )}
                </div>

                <StatusBadge status={m.status} />

                <button
                  onClick={() => toggle(m.id, m.batchId)}
                  disabled={noBatch}
                  className={clsx(
                    "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-150",
                    noBatch
                      ? "cursor-not-allowed border border-base-600 bg-base-800 text-white/20"
                      : isPresent
                      ? "bg-accent-green text-base-900 shadow-md shadow-accent-green/20 hover:bg-accent-green/80 active:scale-95"
                      : "border border-base-500 bg-base-700 text-white/50 hover:border-white/30 hover:text-white active:scale-95"
                  )}
                >
                  {isPresent ? "Present" : "Absent"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="sticky bottom-4 space-y-2">
        {justSaved && (
          <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-center text-sm font-semibold text-accent-green">
            ✓ Attendance saved!
          </div>
        )}
        {syncError && (
          <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
            ⚠ {syncError}
          </div>
        )}
        {pendingCount > 0 && (
          <button
            className="btn-primary w-full !py-4 text-base"
            onClick={flush}
            disabled={syncing}
          >
            {syncing ? "Saving…" : `Save Changes (${pendingCount} pending)`}
          </button>
        )}
      </div>
    </div>
  );
}
