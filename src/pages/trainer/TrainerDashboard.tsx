import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTrainerBatches, usePTClients } from "@/hooks/useTrainerData";
import { batchRunsToday } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

export function TrainerDashboard() {
  const { profile } = useAuth();
  const { data: batches, isLoading: batchesLoading } = useTrainerBatches(profile?.id);
  const { data: ptClients, isLoading: ptLoading } = usePTClients(profile?.id);

  const todaysBatches = (batches ?? [])
    .filter((b) => b.status === "active")
    .filter((b) => batchRunsToday(b.days));

  const otherBatches = (batches ?? []).filter((b) => !todaysBatches.includes(b));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Today's Sessions</h1>
        <p className="text-sm text-white/50">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      {batchesLoading && <p className="text-white/50">Loading your batches…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {todaysBatches.map((batch) => (
          <Link key={batch.id} to={`/trainer/batch/${batch.id}`}>
            <Card className="transition-colors hover:border-accent-green/50">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-semibold uppercase text-accent-green">
                  Today
                </span>
                <span className="text-xs text-white/40">{batch.days}</span>
              </div>
              <h3 className="mt-3 text-lg font-bold">{batch.name}</h3>
              <p className="text-sm text-white/50">{batch.time_slot}</p>
              <div className="mt-4 text-sm font-semibold text-accent-green">Mark Attendance →</div>
            </Card>
          </Link>
        ))}

        {!batchesLoading && todaysBatches.length === 0 && (
          <Card className="sm:col-span-2 text-center text-white/50">No batches scheduled for you today.</Card>
        )}
      </div>

      {!ptLoading && (ptClients?.length ?? 0) > 0 && (
        <Link to="/trainer/pt">
          <Card className="border-accent-orange/40 transition-colors hover:border-accent-orange">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Personal Training Clients</h3>
                <p className="text-sm text-white/50">{ptClients?.length} client{ptClients?.length === 1 ? "" : "s"} assigned</p>
              </div>
              <span className="text-sm font-semibold text-accent-orange">Log Sessions →</span>
            </div>
          </Card>
        </Link>
      )}

      {otherBatches.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/40">
            Other Assigned Batches
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherBatches.map((batch) => (
              <Link key={batch.id} to={`/trainer/batch/${batch.id}`}>
                <Card className="opacity-70 transition-opacity hover:opacity-100">
                  <h3 className="font-semibold">{batch.name}</h3>
                  <p className="text-sm text-white/50">
                    {batch.time_slot} · {batch.days}
                    {batch.status === "upcoming" && " · Upcoming"}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
