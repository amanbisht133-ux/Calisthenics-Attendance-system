import { useBranch } from "@/context/BranchContext";
import { useAttendanceRanking } from "@/hooks/useLeaderboard";
import { Leaderboard as LeaderboardList } from "@/components/Leaderboard";

export function TrainerLeaderboard() {
  const { selectedBranchId, selectedBranch } = useBranch();
  const { data: entries, isLoading } = useAttendanceRanking(selectedBranchId ?? undefined);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏆 Leaderboard</h1>
        <p className="text-sm text-white/50">
          Most sessions attended this month{selectedBranch ? ` — ${selectedBranch.name}` : ""}
        </p>
      </div>
      <div className="card">
        <LeaderboardList entries={entries} isLoading={isLoading} />
      </div>
    </div>
  );
}
