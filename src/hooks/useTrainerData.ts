import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Batch, MemberWithStatus, PTClient } from "@/lib/database.types";
import { memberStatus, todayISO } from "@/lib/utils";

export function useTrainerBatches(trainerId: string | undefined) {
  return useQuery({
    queryKey: ["trainer-batches", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_batches")
        .select("batch:batches(*)")
        .eq("trainer_id", trainerId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.batch as Batch).filter(Boolean);
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
