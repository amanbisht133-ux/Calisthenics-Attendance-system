import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useAllMembers, useTodayAllAttendance } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchBar } from "@/components/ui/SearchBar";
import { todayISO, formatDate } from "@/lib/utils";

// Gets or creates an attendance_record for (trainer, batch, today)
async function getOrCreateRecord(
  trainerId: string,
  batchId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("batch_id", batchId)
    .eq("trainer_id", trainerId)
    .eq("session_date", todayISO())
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabase
    .from("attendance_records")
    .insert({ batch_id: batchId, trainer_id: trainerId, session_date: todayISO() })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

type AllMember = NonNullable<ReturnType<typeof useAllMembers>["data"]>[number];

export function AllMembersAttendance() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading } = useAllMembers();
  const { data: todayAttendance, isLoading: attendanceLoading } =
    useTodayAllAttendance(profile?.id);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "absent" | "unmarked">("all");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggleAttendance = useCallback(
    async (member: AllMember) => {
      if (!profile?.id) return;

      const entries = todayAttendance?.get(member.id) ?? [];
      const existing = entries[0] ?? null; // use first/most recent entry

      setSaving((prev) => new Set(prev).add(member.id));
      setError(null);

      try {
        if (existing) {
          // Toggle existing entry (present ↔ absent)
          await supabase
            .from("attendance_entries")
            .update({ present: !existing.present })
            .eq("id", existing.entryId);
        } else {
          // Need a batch to file the entry under — use member's primary batch
          const batchId = (member as any).batchId as string | null;
          if (!batchId) {
            setError(
              `${member.name} has no batch assigned. Use Today's Session to mark them.`
            );
            return;
          }
          const recordId = await getOrCreateRecord(profile.id, batchId);
          await supabase.from("attendance_entries").insert({
            attendance_record_id: recordId,
            member_id: member.id,
            present: true,
          });
        }

        await queryClient.invalidateQueries({
          queryKey: ["today-all-attendance", profile.id],
        });
      } catch (e: any) {
        setError(e.message ?? "Failed to save. Try again.");
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      }
    },
    [profile?.id, todayAttendance, queryClient]
  );

  const isLoading = membersLoading || attendanceLoading;
  const allMembers = members ?? [];

  // Stats
  const totalPresent = Array.from(todayAttendance?.values() ?? []).filter((e) =>
    e.some((x) => x.present)
  ).length;
  const totalAbsent = Array.from(todayAttendance?.values() ?? []).filter((e) =>
    e.every((x) => !x.present)
  ).length;
  const totalMarked = todayAttendance?.size ?? 0;

  // Filter + search
  const filtered = allMembers.filter((m) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.phone.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (filter === "all") return true;
    const entries = todayAttendance?.get(m.id) ?? [];
    if (filter === "present") return entries.some((e) => e.present);
    if (filter === "absent") return entries.length > 0 && entries.every((e) => !e.present);
    if (filter === "unmarked") return entries.length === 0;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">All Members</h1>
        <p className="text-sm text-white/50">
          {formatDate(todayISO(), "EEEE, dd MMM yyyy")}
        </p>
      </div>

      {/* Stats strip */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-accent-green">{totalPresent}</div>
            <div className="text-xs text-white/40">Present</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-status-expired">{totalAbsent}</div>
            <div className="text-xs text-white/40">Absent</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-white/60">
              {allMembers.length - totalMarked}
            </div>
            <div className="text-xs text-white/40">Unmarked</div>
          </div>
        </div>
      )}

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />

      {/* Filter pills */}
      <div className="flex gap-2">
        {(["all", "present", "absent", "unmarked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
              filter === f
                ? "bg-accent-green text-base-900"
                : "border border-base-500 bg-base-800 text-white/50 hover:text-white"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
          ⚠ {error}
          <button className="ml-2 text-white/60" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Member list */}
      {isLoading ? (
        <p className="text-white/50">Loading members…</p>
      ) : (
        <div className="card divide-y divide-base-700">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-white/40">
              {search ? `No members match "${search}"` : "No members in this filter."}
            </div>
          )}

          {filtered.map((member) => {
            const entries = todayAttendance?.get(member.id) ?? [];
            const entry = entries[0] ?? null;
            const isSaving = saving.has(member.id);
            const isPresent = entry?.present === true;
            const isAbsent = entry !== null && entry.present === false;
            const isUnmarked = entry === null;
            const noBatch = !(member as any).batchId && isUnmarked;

            return (
              <div
                key={member.id}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  isPresent && "bg-accent-green/5",
                  isAbsent && "bg-status-expired/5"
                )}
              >
                {/* Left: info */}
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      "truncate font-semibold",
                      member.status === "expired" &&
                        !isPresent &&
                        "text-status-expired"
                    )}
                  >
                    {member.status === "expired" && !isPresent && "⚠️ "}
                    {member.name}
                  </div>
                  <div className="text-xs text-white/40">{member.phone}</div>
                  {noBatch && (
                    <div className="text-xs text-yellow-500/70">
                      No batch — use Today's Session to mark
                    </div>
                  )}
                </div>

                {/* Membership status badge */}
                <StatusBadge status={member.status} />

                {/* Today attendance status */}
                <div
                  className={clsx(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    isPresent
                      ? "bg-accent-green/20 text-accent-green"
                      : isAbsent
                      ? "bg-status-expired/15 text-status-expired"
                      : "bg-base-700 text-white/30"
                  )}
                >
                  {isPresent ? "✓ Present" : isAbsent ? "✗ Absent" : "—"}
                </div>

                {/* Edit / Mark button */}
                <button
                  onClick={() => toggleAttendance(member)}
                  disabled={isSaving || noBatch}
                  title={
                    noBatch
                      ? "No batch assigned"
                      : isPresent
                      ? "Click to mark absent"
                      : isAbsent
                      ? "Click to mark present"
                      : "Click to mark present"
                  }
                  className={clsx(
                    "shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all duration-150 active:scale-95",
                    noBatch
                      ? "cursor-not-allowed border border-base-600 bg-base-800 text-white/20"
                      : isSaving
                      ? "cursor-wait border border-base-500 bg-base-700 text-white/30"
                      : isPresent
                      ? "border border-accent-green/40 bg-transparent text-accent-green hover:border-status-expired/40 hover:bg-status-expired/10 hover:text-status-expired"
                      : isAbsent
                      ? "border border-status-expired/40 bg-transparent text-status-expired hover:border-accent-green/40 hover:bg-accent-green/10 hover:text-accent-green"
                      : "border border-base-500 bg-base-700 text-white/60 hover:border-accent-green/40 hover:text-white"
                  )}
                >
                  {isSaving
                    ? "…"
                    : isPresent
                    ? "Mark Absent"
                    : isAbsent
                    ? "Mark Present"
                    : "Mark Present"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
