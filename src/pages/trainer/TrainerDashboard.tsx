import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useAllBatches, usePTClients } from "@/hooks/useTrainerData";
import { useAttendanceRanking } from "@/hooks/useLeaderboard";
import { Leaderboard } from "@/components/Leaderboard";
import { batchRunsToday, batchTimeBucket, currentTimeBucket, BATCH_TIME_BUCKETS, type BatchTimeBucket } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import type { Batch } from "@/lib/database.types";

export function TrainerDashboard() {
  const { profile } = useAuth();
  const { selectedBranchId } = useBranch();
  const { data: batches, isLoading: batchesLoading } = useAllBatches(selectedBranchId ?? undefined);
  const { data: ptClients, isLoading: ptLoading } = usePTClients(profile?.id);
  const { data: ranking, isLoading: rankingLoading } = useAttendanceRanking(selectedBranchId ?? undefined);
  const [openBucket, setOpenBucket] = useState<BatchTimeBucket | null>(currentTimeBucket());

  const todaysBatches = (batches ?? []).filter((b) => b.status === "active" && batchRunsToday(b.days));

  const grouped = new Map<BatchTimeBucket, Batch[]>();
  for (const batch of todaysBatches) {
    const bucket = batchTimeBucket(batch);
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push(batch);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Today's Sessions</h1>
        <p className="text-sm text-white/50">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {!ptLoading && (ptClients?.length ?? 0) > 0 && (
        <Link to="/trainer/pt">
          <Card className="border-accent-orange/40 !p-4 transition-colors hover:border-accent-orange">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">Personal Training Clients</h3>
                <p className="text-sm text-white/50">
                  {ptClients?.length} client{ptClients?.length === 1 ? "" : "s"} assigned
                </p>
              </div>
              <span className="text-sm font-semibold text-accent-orange">Log →</span>
            </div>
          </Card>
        </Link>
      )}

      {batchesLoading && <p className="text-white/50">Loading your batches…</p>}

      {!batchesLoading && todaysBatches.length === 0 && (
        <Card className="text-center text-white/50">No batches scheduled for you today.</Card>
      )}

      <div className="space-y-2">
        {BATCH_TIME_BUCKETS.filter((b) => grouped.has(b.key)).map((bucket) => {
          const batchesInBucket = grouped.get(bucket.key)!;
          const isOpen = openBucket === bucket.key;
          return (
            <div key={bucket.key} className="card overflow-hidden !p-0">
              <button
                className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-base-700"
                onClick={() => setOpenBucket(isOpen ? null : bucket.key)}
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{bucket.icon}</span>
                  <span className="font-bold">{bucket.label}</span>
                  <span className="text-xs font-normal text-white/40">
                    {batchesInBucket.length} batch{batchesInBucket.length === 1 ? "" : "es"}
                  </span>
                </span>
                <span className={clsx("text-white/40 transition-transform", isOpen && "rotate-180")}>▾</span>
              </button>
              {isOpen && (
                <div className="grid gap-3 border-t border-base-700 p-3 sm:grid-cols-2">
                  {batchesInBucket.map((batch) => (
                    <Link key={batch.id} to={`/trainer/batch/${batch.id}`}>
                      <Card className="!p-4 transition-colors hover:border-accent-green/50 active:scale-[0.98]">
                        <h3 className="text-base font-bold">{batch.name}</h3>
                        <p className="text-sm text-white/50">{batch.time_slot}</p>
                        <div className="mt-2 text-xs font-semibold text-accent-green">Mark Attendance →</div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card !p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-bold">🏆 Top Attendees This Month</h2>
          <Link to="/trainer/leaderboard" className="text-xs font-semibold text-accent-green hover:underline">
            View full →
          </Link>
        </div>
        <div className="mt-2">
          <Leaderboard entries={ranking} isLoading={rankingLoading} limit={3} />
        </div>
      </div>
    </div>
  );
}
