import { Link } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useAllMembers, useAttendanceMapForDate } from "@/hooks/useTrainerData";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatCard } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useState } from "react";
import { todayISO, daysAgoISO, formatDate } from "@/lib/utils";
import type { MemberWithStatus } from "@/lib/database.types";

const EDIT_WINDOW_DAYS = 6; // plus today = 7 days total, matching the trainer RLS window

type MemberWithBatch = MemberWithStatus & {
  batchId: string | null;
  member_batches: { batch_id: string }[];
};

export function AllMembersAttendance() {
  const { profile } = useAuth();
  const { selectedBranchId } = useBranch();
  const [date, setDate] = useState(todayISO());
  const isToday = date === todayISO();
  const isEditable = date >= daysAgoISO(EDIT_WINDOW_DAYS);

  const { data: members, isLoading: membersLoading } = useAllMembers(selectedBranchId ?? undefined);

  // Members this trainer marked present on the selected date, and in which batch.
  const { data: presenceMap = new Map(), isLoading: statusLoading } = useAttendanceMapForDate(profile?.id, date);

  const [search, setSearch] = useState("");

  const filtered = ((members ?? []) as MemberWithBatch[]).filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q);
  });

  const isLoading = membersLoading || statusLoading;

  const allMembers = (members ?? []) as MemberWithBatch[];
  const presentCount = allMembers.filter((m) => presenceMap.has(m.id)).length;
  const absentCount = allMembers.length - presentCount;

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(filtered);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">All Members</h1>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            className="input !w-auto !py-1.5 text-sm"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
          {!isToday && (
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setDate(todayISO())}>
              Jump to today
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-white/30">
          {isToday ? (
            <>
              Membership status and today's attendance so far.{" "}
              <Link to="/trainer" className="text-accent-green hover:underline">
                Go to Today's Sessions
              </Link>{" "}
              to mark attendance.
            </>
          ) : isEditable ? (
            `Attendance for ${formatDate(date, "EEEE, dd MMM yyyy")} — anyone not marked present is Absent. Open that day's batch to make corrections (edits are allowed up to 7 days back).`
          ) : (
            `Attendance for ${formatDate(date, "EEEE, dd MMM yyyy")} is final — anyone not marked present is Absent.`
          )}
        </p>
      </div>

      {/* Scorecard */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Present" value={presentCount} accent="green" />
          <StatCard label={isToday ? "Not Marked / Absent" : "Absent"} value={absentCount} accent="red" />
        </div>
      )}

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />

      {/* Member list */}
      {isLoading ? (
        <p className="text-white/50">Loading members…</p>
      ) : (
        <div className="card divide-y divide-base-700">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-white/40">
              No members match "{search}"
            </div>
          )}

          {pageItems.map((member) => {
            const presence = presenceMap.get(member.id);
            const isPresent = !!presence;
            const isAbsent = !isPresent && !isToday;

            return (
              <div
                key={member.id}
                className={clsx(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors",
                  isPresent && "bg-accent-green/5",
                  (isAbsent || (member.status === "expired" && !isPresent)) && "bg-status-expired/5"
                )}
              >
                {/* Info */}
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div
                    className={clsx(
                      "truncate font-semibold",
                      member.status === "expired" && !isPresent && "text-status-expired"
                    )}
                  >
                    {member.status === "expired" && !isPresent && "⚠️ "}
                    {member.name}
                  </div>
                  <div className="text-xs text-white/40">{member.phone}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={member.status} />

                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
                      isPresent
                        ? "bg-accent-green/15 text-accent-green"
                        : isAbsent
                        ? "bg-status-expired/15 text-status-expired"
                        : "border border-base-600 bg-base-800 text-white/30"
                    )}
                  >
                    {isPresent ? `✓ Present · ${presence.batchName}` : isAbsent ? "Absent" : "Not marked yet"}
                  </span>

                  {isPresent && isToday && (
                    <Link to={`/trainer/batch/${presence.batchId}`} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
                      Go →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  );
}
