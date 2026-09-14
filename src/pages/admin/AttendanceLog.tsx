import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate, todayISO } from "@/lib/utils";
import type { Batch, Profile } from "@/lib/database.types";

const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function AttendanceLog() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [batchId, setBatchId] = useState("all");
  const [trainerId, setTrainerId] = useState("all");

  const { data: batches } = useQuery({
    queryKey: ["all-batches"],
    queryFn: async () => (await supabase.from("batches").select("*").order("name")).data as Batch[],
  });
  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name")).data as Profile[],
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ["attendance-log", from, to, batchId, trainerId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_records")
        .select(
          "*, batch:batches(name), trainer:profiles(full_name), entries:attendance_entries(id, present, is_post_expiry), demo_visitors(id)"
        )
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: false });

      if (batchId !== "all") query = query.eq("batch_id", batchId);
      if (trainerId !== "all") query = query.eq("trainer_id", trainerId);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  function handleExport() {
    exportToExcel(`attendance-log-${from}_to_${to}.xlsx`, [
      {
        sheetName: "Attendance Log",
        rows: (records ?? []).map((r: any) => ({
          Date: r.session_date,
          Batch: r.batch?.name,
          Trainer: r.trainer?.full_name,
          "Present Count": r.entries.filter((e: any) => e.present).length,
          "Post-Expiry Attendances": r.entries.filter((e: any) => e.is_post_expiry).length,
          "Demo Visitors": r.demo_visitors.length,
          "Submitted At": r.submitted_at,
        })),
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Attendance Log</h1>
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Batch</label>
          <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="all">All Batches</option>
            {(batches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Trainer</label>
          <select className="input" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="all">All Trainers</option>
            {(trainers ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Date</th>
              <th>Batch</th>
              <th>Marked By</th>
              <th>Present</th>
              <th>Post-Expiry</th>
              <th>Demo Visitors</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r: any) => {
              const presentCount = r.entries.filter((e: any) => e.present).length;
              const postExpiryCount = r.entries.filter((e: any) => e.is_post_expiry).length;
              return (
                <tr key={r.id} className={postExpiryCount > 0 ? "bg-status-expired/10" : ""}>
                  <td>{formatDate(r.session_date)}</td>
                  <td>{r.batch?.name}</td>
                  <td>{r.trainer?.full_name}</td>
                  <td>{presentCount}</td>
                  <td className={postExpiryCount > 0 ? "font-bold text-status-expired" : ""}>{postExpiryCount || "—"}</td>
                  <td>{r.demo_visitors.length}</td>
                  <td className="text-white/40">{new Date(r.submitted_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {!isLoading && (records ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-white/40">
                  No attendance records for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
