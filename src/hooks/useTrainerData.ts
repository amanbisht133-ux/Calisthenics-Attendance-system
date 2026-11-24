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
        .select("*, member_batches(batch_id), pt_clients(id)")
        .eq("branch_id", branchId)
        .order("name");
      if (error) throw error;
      const members = (data ?? []) as (import("@/lib/database.types").Member & {
        member_batches: { batch_id: string }[];
        pt_clients: { id: string }[] | null;
        also_group?: boolean;
      })[];
      return members.map((m) => ({
        ...m,
        status: memberStatus(m.expiry_date),
        // first assigned batch id, or null if unassigned
        batchId: m.member_batches?.[0]?.batch_id ?? null,
        batchIds: (m.member_batches ?? []).map((mb) => mb.batch_id),
        // Pure PT client: has a PT package and is not marked as also doing group classes.
        ptOnly: (m.pt_clients?.length ?? 0) > 0 && !m.also_group,
      }));
    },
  });
}

// A trainer can be assigned to more than one branch, and their PT clients
// span whichever branch each client belongs to — scope to the branch
// currently selected in the trainer UI, not every branch this trainer has.
export function usePTClients(trainerId: string | undefined, branchId: string | undefined) {
  return useQuery({
    queryKey: ["pt-clients", trainerId, branchId],
    enabled: !!trainerId && !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pt_clients")
        .select("*, member:members!inner(*)")
        .eq("trainer_id", trainerId)
        .eq("member.branch_id", branchId);
      if (error) throw error;
      // Only active PT clients: once the package end date has passed they drop off the list.
      const today = new Date().toLocaleDateString("en-CA");
      return ((data ?? []) as (PTClient & { member: MemberWithStatus })[]).filter(
        (c) => !c.member.expiry_date || c.member.expiry_date >= today
      );
    },
  });
}

export interface TodaysPresence {
  batchId: string;
  batchName: string;
  entryId: string;
}

// Map of memberId -> the one batch they were marked present in on the given
// date (by any trainer of the academy: the sheet is shared). A member can only be present in one session per
// day, so this is also used to hide them from every other batch's roster.
export function useAttendanceMapForDate(trainerId: string | undefined, date: string) {
  return useQuery({
    queryKey: ["attendance-map", trainerId, date],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("batch_id, batch:batches(name), entries:attendance_entries(id, member_id)")
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
      // One shared sheet per class per day: merge whatever any trainer has marked.
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, entries:attendance_entries(*), demo_visitors(*)")
        .eq("batch_id", batchId)
        .eq("session_date", date)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const seen = new Set<string>();
      const entries = data
        .flatMap((r: any) => r.entries ?? [])
        .filter((e: any) => (seen.has(e.member_id) ? false : (seen.add(e.member_id), true)));
      return { ...data[0], entries, demo_visitors: data.flatMap((r: any) => r.demo_visitors ?? []) } as any;
    },
  });
}

export function useTodaysAttendanceRecord(batchId: string | undefined, trainerId: string | undefined) {
  return useAttendanceRecordForDate(batchId, trainerId, todayISO());
}

// Balance still owed on each member's current package (trainers can't read
// payments directly; this database function returns only the number).
export function useMemberDues(branchId: string | undefined) {
  return useQuery({
    queryKey: ["member-dues", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_dues", { p_branch_id: branchId });
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { member_id: string; balance_due: number | string }[]) {
        const due = Number(row.balance_due);
        if (due > 0) map.set(row.member_id, due);
      }
      return map;
    },
  });
}
