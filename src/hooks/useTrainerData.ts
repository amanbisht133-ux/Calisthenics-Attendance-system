import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Batch, MemberWithStatus, PTClient } from "@/lib/database.types";
import { memberStatus } from "@/lib/utils";

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

