import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAttendanceRanking } from "@/hooks/useLeaderboard";
import { Leaderboard } from "@/components/Leaderboard";
import { formatDate, todayISO } from "@/lib/utils";

export function AdminOverview() {
  const { data: ranking, isLoading: rankingLoading } = useAttendanceRanking("all");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview", todayISO()],
    queryFn: async () => {
      const today = todayISO();

      const [active, expiring, expired, recordsToday, demoToday, recentExpired] = await Promise.all([
        supabase.from("v_member_status").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("v_member_status").select("id", { count: "exact", head: true }).eq("status", "expiring_soon"),
        supabase.from("v_member_status").select("id", { count: "exact", head: true }).eq("status", "expired"),
        supabase.from("attendance_records").select("id").eq("session_date", today),
        supabase.from("demo_visitors").select("id", { count: "exact", head: true }).eq("visit_date", today),
        supabase.from("v_expired_members").select("*").limit(5),
      ]);

      const recordIds = (recordsToday.data ?? []).map((r) => r.id);
      let attendanceTodayCount = 0;
      if (recordIds.length > 0) {
        const { count } = await supabase
          .from("attendance_entries")
          .select("id", { count: "exact", head: true })
          .eq("present", true)
          .in("attendance_record_id", recordIds);
        attendanceTodayCount = count ?? 0;
      }

      return {
        activeCount: active.count ?? 0,
        expiringCount: expiring.count ?? 0,
        expiredCount: expired.count ?? 0,
        attendanceTodayCount,
        demoTodayCount: demoToday.count ?? 0,
        recentExpired: recentExpired.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-white/50">{formatDate(todayISO(), "EEEE, dd MMM yyyy")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Active Members" value={isLoading ? "…" : data!.activeCount} accent="green" />
        <StatCard label="Expiring This Week" value={isLoading ? "…" : data!.expiringCount} accent="orange" />
        <StatCard label="Expired" value={isLoading ? "…" : data!.expiredCount} accent="red" />
        <StatCard label="Today's Attendance" value={isLoading ? "…" : data!.attendanceTodayCount} accent="green" />
        <StatCard label="Today's Demo Visitors" value={isLoading ? "…" : data!.demoTodayCount} accent="orange" />
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recently Expired</h2>
          <Link to="/admin/expired" className="text-sm font-semibold text-accent-green hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Expired On</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentExpired ?? []).map((m: any) => (
                <tr key={m.id}>
                  <td className="font-semibold">{m.name}</td>
                  <td>{m.phone}</td>
                  <td>{formatDate(m.expiry_date)}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.recentExpired ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-white/40">
                    No expired members. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card !p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-bold">🏆 Top Attendees This Month</h2>
          <Link to="/admin/leaderboard" className="text-sm font-semibold text-accent-green hover:underline">
            View full →
          </Link>
        </div>
        <div className="mt-3">
          <Leaderboard entries={ranking} isLoading={rankingLoading} limit={5} />
        </div>
      </div>
    </div>
  );
}
