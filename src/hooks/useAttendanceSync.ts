import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/utils";

const SYNC_INTERVAL_MS = 30_000;

export type SavedEntry = { entryId: string; batchId: string };
type PendingChange = { action: "add" | "remove"; batchId: string };

// Returns record id for (trainer, batch, date) — creates one if missing
export async function getOrCreateRecord(trainerId: string, batchId: string): Promise<string> {
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

// Tracks a trainer's today-wide attendance state (across every batch they mark)
// and syncs local toggles to Supabase. Present/absent for a member is the same
// no matter which batch's page you're viewing — once marked, it shows as
// present everywhere. New marks are recorded under whatever batchId the caller
// passes to toggle(), not the member's own assigned batch.
export function useAttendanceSync(trainerId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: savedEntries = new Map<string, SavedEntry>(), isLoading: savedLoading } = useQuery({
    queryKey: ["all-attendance-today", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data: records } = await supabase
        .from("attendance_records")
        .select("id, batch_id, entries:attendance_entries(id, member_id)")
        .eq("trainer_id", trainerId!)
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

  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
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
    if (!trainerId) return;

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
          const recordId = await getOrCreateRecord(trainerId, batchId);
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
        queryKey: ["all-attendance-today", trainerId],
      });

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e: any) {
      setSyncError(e.message ?? "Sync failed. Will retry.");
    } finally {
      setSyncing(false);
    }
  }, [trainerId, savedEntries, queryClient]);

  // Auto-sync every 30s
  useEffect(() => {
    const interval = setInterval(flush, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flush]);

  // Flush on unmount
  useEffect(() => () => { flush(); }, []); // eslint-disable-line

  // batchIdForAdd is the batch a *new* present-mark should be recorded under
  // (ignored when un-marking an already-saved entry, which is deleted by id
  // regardless of which batch it was originally recorded in).
  function toggle(memberId: string, batchIdForAdd: string | null) {
    const batchId = batchIdForAdd ?? savedEntries.get(memberId)?.batchId;
    if (!batchId) return;

    setPresentIds((prev) => {
      const next = new Set(prev);
      const wasSaved = savedEntries.has(memberId);

      if (next.has(memberId)) {
        next.delete(memberId);
        if (wasSaved) {
          pendingRef.current.set(memberId, { action: "remove", batchId });
        } else {
          pendingRef.current.delete(memberId);
        }
      } else {
        next.add(memberId);
        if (wasSaved) {
          pendingRef.current.delete(memberId);
        } else {
          pendingRef.current.set(memberId, { action: "add", batchId });
        }
      }
      return next;
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 3000);
  }

  return {
    savedEntries,
    savedLoading,
    presentIds,
    toggle,
    flush,
    syncing,
    syncError,
    justSaved,
    pendingCount: pendingRef.current.size,
  };
}
