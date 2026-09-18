import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAttendanceRanking } from "@/hooks/useLeaderboard";
import { Leaderboard as LeaderboardList } from "@/components/Leaderboard";
import type { Branch } from "@/lib/database.types";

export function AdminLeaderboard() {
  const [branchId, setBranchId] = useState<string>("all");

  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const { data: entries, isLoading } = useAttendanceRanking(branchId as string | "all");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏆 Leaderboard</h1>
          <p className="text-sm text-white/50">Most sessions attended this month</p>
        </div>
        <select className="input sm:max-w-xs" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="all">All Branches</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        <LeaderboardList entries={entries} isLoading={isLoading} />
      </div>
    </div>
  );
}
