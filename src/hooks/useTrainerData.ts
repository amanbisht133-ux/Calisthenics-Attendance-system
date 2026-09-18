import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Batch, Branch, MemberWithStatus, PTClient } from "@/lib/database.types";
import { memberStatus, todayISO } from "@/lib/utils";

// Branches this trainer is assigned to (admin-managed via trainer_branches).
export function useMyBranches(trainerId: string | undefined) {
  return useQuery({
    queryKey: ["my-branches", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_branches")
        .select("branch:branches(id, name, created_at)")
        .eq("trainer_id", trainerId);
      if (error) throw error;
      return ((data ?? []).map((r: any) => r.branch).filter(Boolean) as Branch[]).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
  });
}

export function useAllBatches(branchId: string | undefined) {
  return useQuery({
    queryKey: ["all-batches", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*")
        .eq("branch_id", branchId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Batch[];
    },
  });
}

export function useAllMembers(branchId: string | undefined) {
  return useQuery({
    queryKey: ["all-members", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, member_batches(batch_id)")
        .eq("branch_id", branchId)
        .order("name");
      if (error) throw error;
      const members = (data ?? []) as (import("@/lib/database.types").Member & {
        member_batches: { batch_id: string }[];
      })[];
      return members.map((m) => ({
        ...m,
        status: memberStatus(m.expiry_date),
        // first assigned batch id, or null if unassigned
        batchId: m.member_batches?.[0]?.batch_id ?? null,
      }));
    },
  });
}

export function usePTClients(trainerId: string | undefined) {
  return useQuery({
    queryKey: ["pt-clients", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pt_clients")
        .select("*, member:members(*)")
        .eq("trainer_id", trainerId);
      if (error) throw error;
      return (data ?? []) as (PTClient & { member: MemberWithStatus })[];
    },
  });
}

export interface TodaysPresence {
  batchId: string;
  batchName: string;
  entryId: string;
}

// Map of memberId -> the one batch they were marked present in on the given
// date (by this trainer). A member can only be present in one session per
// day, so this is also used to hide them from every other batch's roster.
export function useAttendanceMapForDate(trainerId: string | undefined, date: string) {
  return useQuery({
    queryKey: ["attendance-map", trainerId, date],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("batch_id, batch:batches(name), entries:attendance_entries(id, member_id)")
        .eq("trainer_id", trainerId)
        .eq("session_date", date);
      if (error) throw error;

      const map = new Map<string, TodaysPresence>();
      for (const rec of records ?? []) {
        const batchName = (rec as any).batch?.name ?? "Unknown batch";
        for (const entry of (rec as any).entries ?? []) {
          map.set(entry.member_id, { batchId: (rec as any).batch_id, batchName, entryId: entry.id });
        }
      }
      return map;
    },
  });
}

export function useTodaysAttendanceMap(trainerId: string | undefined) {
  return useAttendanceMapForDate(trainerId, todayISO());
}

export function useAttendanceRecordForDate(
  batchId: string | undefined,
  trainerId: string | undefined,
  date: string
) {
  return useQuery({
    queryKey: ["attendance-record", batchId, trainerId, date],
    enabled: !!batchId && !!trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, entries:attendance_entries(*), demo_visitors(*)")
        .eq("batch_id", batchId)
        .eq("trainer_id", trainerId)
        .eq("session_date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTodaysAttendanceRecord(batchId: string | undefined, trainerId: string | undefined) {
  return useAttendanceRecordForDate(batchId, trainerId, todayISO());
}
