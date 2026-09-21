import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAttendanceRanking } from "@/hooks/useLeaderboard";
import { Leaderboard } from "@/components/Leaderboard";
import { formatDate, todayISO } from "@/lib/utils";
import type { Branch } from "@/lib/database.types";

export function AdminOverview() {
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const { data: ranking, isLoading: rankingLoading } = useAttendanceRanking(branchFilter);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview", todayISO(), branchFilter],
    queryFn: async () => {
      const today = todayISO();

      // Scope everything to one branch's batches when a specific branch is selected.
      let batchIds: string[] | null = null;
      if (branchFilter !== "all") {
        const { data: batchRows, error: batchError } = await supabase
          .from("batches")
          .select("id")
          .eq("branch_id", branchFilter);
        if (batchError) throw batchError;
        batchIds = (batchRows ?? []).map((b) => b.id);
      }

      let memberStatusQuery = supabase.from("v_member_status").select("id, status");
      if (branchFilter !== "all") memberStatusQuery = memberStatusQuery.eq("branch_id", branchFilter);

      let expiredQuery = supabase.from("v_expired_members").select("*").limit(5);
      if (branchFilter !== "all") expiredQuery = expiredQuery.eq("branch_id", branchFilter);

      let recordsTodayQuery = supabase.from("attendance_records").select("id").eq("session_date", today);
      if (batchIds) recordsTodayQuery = recordsTodayQuery.in("batch_id", batchIds);

      const [memberStatus, recordsToday, recentExpired] = await Promise.all([
        memberStatusQuery,
        recordsTodayQuery,
        expiredQuery,
      ]);
      if (memberStatus.error) throw memberStatus.error;
      if (recordsToday.error) throw recordsToday.error;
      if (recentExpired.error) throw recentExpired.error;

      const statusRows = memberStatus.data ?? [];
      const activeCount = statusRows.filter((r) => r.status === "active").length;
      const expiringCount = statusRows.filter((r) => r.status === "expiring_soon").length;
      const expiredCount = statusRows.filter((r) => r.status === "expired").length;

      const recordIds = (recordsToday.data ?? []).map((r) => r.id);
      let attendanceTodayCount = 0;
      let demoTodayCount = 0;
      if (recordIds.length > 0) {
        const [{ count: presentCount }, { count: demoCount }] = await Promise.all([
          supabase
            .from("attendance_entries")
            .select("id", { count: "exact", head: true })
            .eq("present", true)
            .in("attendance_record_id", recordIds),
          supabase
            .from("demo_visitors")
            .select("id", { count: "exact", head: true })
            .eq("visit_date", today)
            .in("attendance_record_id", recordIds),
        ]);
        attendanceTodayCount = presentCount ?? 0;
        demoTodayCount = demoCount ?? 0;
      }

      return {
        activeCount,
        expiringCount,
        expiredCount,
        attendanceTodayCount,
        demoTodayCount,
        recentExpired: recentExpired.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-white/50">{formatDate(todayISO(), "EEEE, dd MMM yyyy")}</p>
        </div>
        <div className="w-full sm:w-auto">
          <label className="label">Branch</label>
          <select className="input sm:w-52" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All Branches</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
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
