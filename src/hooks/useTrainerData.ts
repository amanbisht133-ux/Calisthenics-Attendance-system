import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Batch, MemberWithStatus, PTClient } from "@/lib/database.types";
import { memberStatus, todayISO } from "@/lib/utils";

export interface TodayAttendanceInfo {
  entryId: string;
  recordId: string;
  batchId: string;
  present: boolean;
}

/** All attendance entries for this trainer across ALL batches today.
 *  Returns Map<memberId, TodayAttendanceInfo[]> — a member can appear in multiple batches. */
export function useTodayAllAttendance(trainerId: string | undefined) {
  return useQuery({
    queryKey: ["today-all-attendance", trainerId, todayISO()],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("id, batch_id, entries:attendance_entries(id, member_id, present)")
        .eq("trainer_id", trainerId!)
        .eq("session_date", todayISO());
      if (error) throw error;

      const map = new Map<string, TodayAttendanceInfo[]>();
      for (const record of records ?? []) {
        for (const entry of (record.entries ?? []) as any[]) {
          const arr = map.get(entry.member_id) ?? [];
          arr.push({
            entryId: entry.id,
            recordId: record.id,
            batchId: record.batch_id,
            present: entry.present,
          });
          map.set(entry.member_id, arr);
        }
      }
      return map;
    },
  });
}

export function useTrainerBatches(_trainerId: string | undefined) {
  return useQuery({
    queryKey: ["trainer-batches-all"],
    enabled: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Batch[];
    },
  });
}

export function useAllBatches() {
  return useQuery({
    queryKey: ["all-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Batch[];
    },
  });
}

export function useAllMembers() {
  return useQuery({
    queryKey: ["all-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, member_batches(batch_id)")
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

export function useBatchMembers(batchId: string | undefined) {
  return useQuery({
    queryKey: ["batch-members", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_batches")
        .select("member:members(*)")
        .eq("batch_id", batchId);
      if (error) throw error;
      const members = (data ?? []).map((row: any) => row.member).filter(Boolean) as MemberWithStatus[];
      return members
        .map((m) => ({ ...m, status: memberStatus(m.expiry_date) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useTodaysAttendanceRecord(batchId: string | undefined, trainerId: string | undefined) {
  return useQuery({
    queryKey: ["attendance-record", batchId, trainerId, todayISO()],
    enabled: !!batchId && !!trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, entries:attendance_entries(*), demo_visitors(*)")
        .eq("batch_id", batchId)
        .eq("trainer_id", trainerId)
        .eq("session_date", todayISO())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
