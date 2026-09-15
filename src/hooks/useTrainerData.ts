import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Batch, MemberWithStatus, PTClient } from "@/lib/database.types";
import { memberStatus, todayISO } from "@/lib/utils";

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
