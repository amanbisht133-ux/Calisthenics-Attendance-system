import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useAllMembers } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchBar } from "@/components/ui/SearchBar";
import { todayISO, formatDate } from "@/lib/utils";
import type { MemberWithStatus } from "@/lib/database.types";

const SYNC_INTERVAL_MS = 30_000;

type MemberWithBatch = MemberWithStatus & {
  batchId: string | null;
  member_batches: { batch_id: string }[];
};

type SavedEntry = { entryId: string; batchId: string };
type PendingChange = { action: "add" | "remove"; batchId: string };

// Returns record id for (trainer, batch, date) — creates one if missing
async function getOrCreateRecord(trainerId: string, batchId: string): Promise<string> {
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

export function AllMembersAttendance() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading } = useAllMembers();

  // Entries already saved in DB for today (across all batches for this trainer)
  const { data: savedEntries = new Map<string, SavedEntry>(), isLoading: savedLoading } = useQuery({
    queryKey: ["all-attendance-today", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data: records } = await supabase
        .from("attendance_records")
        .select("id, batch_id, entries:attendance_entries(id, member_id)")
        .eq("trainer_id", profile!.id)
        .eq("session_date", todayISO());

      const map = new Map<string, SavedEntry>();
      for (const rec of records ?? []) {
        for (const entry of (rec as any).entries ?? []) {
          map.set(entry.member_id, { entryId: entry.id, batchId: (rec as any).batch_id });
        }
      }
      return map;
    },
  });

  const [search, setSearch] = useState("");
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  // Map memberId -> pending add/remove not yet flushed
  const pendingRef = useRef<Map<string, PendingChange>>(new Map());

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bring newly-saved members into the displayed present set (e.g. after a flush or a fresh load)
  useEffect(() => {
    setPresentIds((prev) => {
      const next = new Set(prev);
      for (const id of savedEntries.keys()) next.add(id);
      return next;
    });
  }, [savedEntries]);

  const flush = useCallback(async () => {
    if (!profile?.id) return;

    const toFlush = Array.from(pendingRef.current.entries());
    if (toFlush.length === 0) return;

    setSyncing(true);
    setSyncError(null);

    try {
      const toAdd = toFlush.filter(([, change]) => change.action === "add");
      const toRemove = toFlush.filter(([, change]) => change.action === "remove");

      if (toAdd.length > 0) {
        const byBatch = new Map<string, string[]>();
        for (const [memberId, change] of toAdd) {
          if (!byBatch.has(change.batchId)) byBatch.set(change.batchId, []);
          byBatch.get(change.batchId)!.push(memberId);
        }

        for (const [batchId, memberIds] of byBatch) {
          const recordId = await getOrCreateRecord(profile.id, batchId);
          const entries = memberIds.map((member_id) => ({
            attendance_record_id: recordId,
            member_id,
            present: true,
          }));
          const { error } = await supabase.from("attendance_entries").insert(entries);
          if (error) throw error;
        }
      }

      if (toRemove.length > 0) {
        const entryIds = toRemove
          .map(([memberId]) => savedEntries.get(memberId)?.entryId)
          .filter((id): id is string => !!id);
        if (entryIds.length > 0) {
          const { error } = await supabase.from("attendance_entries").delete().in("id", entryIds);
          if (error) throw error;
        }
      }

      for (const [id] of toFlush) pendingRef.current.delete(id);

      await queryClient.invalidateQueries({
        queryKey: ["all-attendance-today", profile.id],
      });

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e: any) {
      setSyncError(e.message ?? "Sync failed. Will retry.");
    } finally {
      setSyncing(false);
    }
  }, [profile?.id, savedEntries, queryClient]);

  // Auto-sync every 30s
  useEffect(() => {
    const interval = setInterval(flush, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flush]);

  // Flush on unmount
  useEffect(() => () => { flush(); }, []); // eslint-disable-line

  function toggle(member: MemberWithBatch) {
    const batchId = member.batchId ?? savedEntries.get(member.id)?.batchId;
    if (!batchId) return; // no batch assigned — can't record attendance

    setPresentIds((prev) => {
      const next = new Set(prev);
      const wasSaved = savedEntries.has(member.id);

      if (next.has(member.id)) {
        next.delete(member.id);
        if (wasSaved) {
          pendingRef.current.set(member.id, { action: "remove", batchId });
        } else {
          pendingRef.current.delete(member.id);
        }
      } else {
        next.add(member.id);
        if (wasSaved) {
          pendingRef.current.delete(member.id);
        } else {
          pendingRef.current.set(member.id, { action: "add", batchId });
        }
      }
      return next;
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 3000);
  }

  const filtered = ((members ?? []) as MemberWithBatch[]).filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q);
  });

  const pendingCount = pendingRef.current.size;

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

                {!isPresent && <StatusBadge status={m.status} />}

                <button
                  onClick={() => toggle(m)}
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
