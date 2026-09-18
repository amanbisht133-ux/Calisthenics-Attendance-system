import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { monthStartISO } from "@/lib/utils";

export interface RankingEntry {
  memberId: string;
  memberName: string;
  count: number;
  rank: number;
}

// Ranks members by how many sessions they were marked present in this month,
// scoped to one branch (or "all" for a global admin view). Ties share a rank
// (two members with the same count both show, say, "#2").
export function useAttendanceRanking(branchId: string | "all" | undefined) {
  return useQuery({
    queryKey: ["attendance-ranking", branchId, monthStartISO()],
    enabled: branchId !== undefined,
    queryFn: async (): Promise<RankingEntry[]> => {
      let batchIds: string[] | null = null;
      if (branchId !== "all") {
        const { data: batchRows, error: batchError } = await supabase
          .from("batches")
          .select("id")
          .eq("branch_id", branchId);
        if (batchError) throw batchError;
        batchIds = (batchRows ?? []).map((b) => b.id);
        if (batchIds.length === 0) return [];
      }

      let query = supabase
        .from("attendance_entries")
        .select("member_id, member:members(name), attendance_record:attendance_records!inner(session_date, batch_id)")
        .gte("attendance_record.session_date", monthStartISO());

      if (batchIds) query = query.in("attendance_record.batch_id", batchIds);

      const { data, error } = await query;
      if (error) throw error;

      const counts = new Map<string, { name: string; count: number }>();
      for (const row of data ?? []) {
        const id = row.member_id as string;
        const name = (row as any).member?.name ?? "Unknown";
        const existing = counts.get(id);
        if (existing) existing.count += 1;
        else counts.set(id, { name, count: 1 });
      }

      const sorted = Array.from(counts.entries())
        .map(([memberId, v]) => ({ memberId, memberName: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count || a.memberName.localeCompare(b.memberName));

      let rank = 0;
      let lastCount: number | null = null;
      return sorted.map((entry, i) => {
        if (entry.count !== lastCount) {
          rank = i + 1;
          lastCount = entry.count;
        }
        return { ...entry, rank };
      });
    },
  });
}
