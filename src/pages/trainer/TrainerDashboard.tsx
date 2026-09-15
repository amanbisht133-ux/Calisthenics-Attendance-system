import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import {
  useAllBatches,
  useAllMembers,
  useTodayAllAttendance,
} from "@/hooks/useTrainerData";
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

export function TrainerDashboard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: batches, isLoading: batchesLoading } = useAllBatches();
  const { data: members, isLoading: membersLoading } = useAllMembers();
  const { data: todayAttendance, isLoading: attendanceLoading } =
    useTodayAllAttendance(profile?.id);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<string | null>(null);

  const activeBatches = (batches ?? []).filter((b) => b.status === "active");
  const selectedBatch = activeBatches.find((b) => b.id === selectedBatchId);

  const filteredMembers = (members ?? []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q)
    );
  });

  // Count present in currently selected batch
  const presentInSelectedBatch = selectedBatchId
    ? Array.from(todayAttendance?.entries() ?? []).filter(([, entries]) =>
        entries.some((e) => e.batchId === selectedBatchId && e.present)
      ).length
    : 0;

  const toggleAttendance = useCallback(
    async (memberId: string, currentPresentInBatch: boolean | null) => {
      if (!profile?.id || !selectedBatchId) return;

      setSaving((prev) => new Set(prev).add(memberId));
      setGlobalError(null);

      try {
        const recordId = await getOrCreateRecord(profile.id, selectedBatchId);
        const newPresent = currentPresentInBatch === true ? false : true;

        // Check if entry already exists for this member in this batch's record
        const { data: existingEntry } = await supabase
          .from("attendance_entries")
          .select("id")
          .eq("attendance_record_id", recordId)
          .eq("member_id", memberId)
          .maybeSingle();

        if (existingEntry) {
          await supabase
            .from("attendance_entries")
            .update({ present: newPresent })
            .eq("id", existingEntry.id);
        } else {
          await supabase.from("attendance_entries").insert({
            attendance_record_id: recordId,
            member_id: memberId,
            present: newPresent,
          });
        }

        await queryClient.invalidateQueries({
          queryKey: ["today-all-attendance", profile.id],
        });
      } catch (e: any) {
        setGlobalError(e.message ?? "Failed to save. Try again.");
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(memberId);
          return next;
        });
      }
    },
    [profile?.id, selectedBatchId, queryClient]
  );

  const isRosterLoading = membersLoading || attendanceLoading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Today's Session</h1>
        <p className="text-sm text-white/50">
          {formatDate(todayISO(), "EEEE, dd MMM yyyy")}
        </p>
      </div>

      {/* ── Batch Selector ── */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-white/40">
          Select Batch
        </p>
        {batchesLoading ? (
          <p className="text-sm text-white/40">Loading batches…</p>
        ) : activeBatches.length === 0 ? (
          <p className="text-sm text-white/40">No active batches found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeBatches.map((batch) => {
              const isSelected = selectedBatchId === batch.id;
              // Count entries saved in this batch today
              const batchPresent = Array.from(
                todayAttendance?.values() ?? []
              ).filter((entries) =>
                entries.some((e) => e.batchId === batch.id && e.present)
              ).length;

              return (
                <button
                  key={batch.id}
                  onClick={() => {
                    setSelectedBatchId(batch.id);
                    setSearch("");
                  }}
                  className={clsx(
                    "group relative rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150",
                    isSelected
                      ? "bg-accent-green text-base-900 shadow-lg shadow-accent-green/20"
                      : "border border-base-500 bg-base-800 text-white/60 hover:border-accent-green/40 hover:bg-base-700 hover:text-white active:scale-95"
                  )}
                >
                  <span>{batch.name}</span>
                  {batchPresent > 0 && (
                    <span
                      className={clsx(
                        "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        isSelected
                          ? "bg-base-900/30 text-base-900"
                          : "bg-accent-green/15 text-accent-green"
                      )}
                    >
                      {batchPresent}✓
                    </span>
                  )}
                  <div className="text-[10px] font-normal opacity-70">
                    {batch.time_slot}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── No batch selected placeholder ── */}
      {!selectedBatchId && !batchesLoading && (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 text-4xl opacity-30">☝️</div>
          <p className="text-white/40">Select a batch above to start marking attendance</p>
        </div>
      )}

      {/* ── Roster ── */}
      {selectedBatchId && (
        <>
          {/* Batch sub-header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">
                {selectedBatch?.name}
                <span className="ml-2 text-sm font-normal text-white/40">
                  {selectedBatch?.time_slot}
                </span>
              </h2>
              <p className="text-xs text-white/40">
                Marking attendance for all members in this session
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-accent-green">
                {presentInSelectedBatch}
              </div>
              <div className="text-xs text-white/40">present</div>
            </div>
          </div>

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search members…"
          />

          {globalError && (
            <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
              ⚠ {globalError}
              <button
                className="ml-2 text-white/60"
                onClick={() => setGlobalError(null)}
              >
                ✕
              </button>
            </div>
          )}

          {isRosterLoading ? (
            <p className="text-white/50">Loading roster…</p>
          ) : (
            <div className="card divide-y divide-base-700">
              {filteredMembers.length === 0 && (
                <div className="px-4 py-8 text-center text-white/40">
                  No members match "{search}"
                </div>
              )}

              {filteredMembers.map((member) => {
                const allEntries = todayAttendance?.get(member.id) ?? [];
                // Entry in the currently selected batch
                const thisBatchEntry =
                  allEntries.find((e) => e.batchId === selectedBatchId) ?? null;
                // Entries in OTHER batches
                const otherEntries = allEntries.filter(
                  (e) => e.batchId !== selectedBatchId
                );
                const otherPresent = otherEntries.find((e) => e.present);
                // If already present in another batch — lock this row
                const lockedByOther = !!otherPresent;
                const isSaving = saving.has(member.id);
                const presentInBatch = thisBatchEntry?.present ?? null; // null = not yet marked

                return (
                  <div
                    key={member.id}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-3.5 transition-colors",
                      lockedByOther
                        ? "opacity-50"
                        : presentInBatch === true
                        ? "bg-accent-green/5"
                        : presentInBatch === false
                        ? "bg-status-expired/5"
                        : ""
                    )}
                  >
                    {/* Member info */}
                    <div className="min-w-0 flex-1">
                      <div
                        className={clsx(
                          "truncate font-semibold",
                          member.status === "expired" &&
                            presentInBatch !== true &&
                            !lockedByOther &&
                            "text-status-expired"
                        )}
                      >
                        {member.status === "expired" &&
                          presentInBatch !== true &&
                          !lockedByOther &&
                          "⚠️ "}
                        {member.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span className="text-xs text-white/40">
                          {member.phone}
                        </span>
                        {lockedByOther && (
                          <span className="text-[10px] font-semibold text-accent-orange/90">
                            ✓ Marked present in{" "}
                            {batches?.find((b) => b.id === otherPresent!.batchId)
                              ?.name ?? "another batch"}
                          </span>
                        )}
                      </div>
                    </div>

                    <StatusBadge status={member.status} />

                    {/* Locked badge OR mark button */}
                    {lockedByOther ? (
                      <div className="shrink-0 rounded-full border border-accent-green/30 bg-accent-green/10 px-4 py-1.5 text-xs font-bold text-accent-green/70 cursor-not-allowed select-none">
                        🔒 Present
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          toggleAttendance(member.id, presentInBatch)
                        }
                        disabled={isSaving}
                        className={clsx(
                          "shrink-0 min-w-[90px] rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-150 active:scale-95",
                          isSaving
                            ? "cursor-wait border border-base-500 bg-base-700 text-white/30"
                            : presentInBatch === true
                            ? "bg-accent-green text-base-900 hover:bg-red-400 hover:text-white"
                            : presentInBatch === false
                            ? "border border-status-expired/60 bg-status-expired/10 text-status-expired hover:bg-accent-green hover:border-transparent hover:text-base-900"
                            : "border border-base-500 bg-base-700 text-white/50 hover:border-accent-green/50 hover:text-white"
                        )}
                      >
                        {isSaving
                          ? "…"
                          : presentInBatch === true
                          ? "✓ Present"
                          : presentInBatch === false
                          ? "✗ Absent"
                          : "Mark"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
