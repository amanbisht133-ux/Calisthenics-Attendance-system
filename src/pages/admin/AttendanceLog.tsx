import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/Card";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate, todayISO } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import type { Batch, MemberStatus, Profile } from "@/lib/database.types";

const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

interface LogRow {
  recordId: string;
  memberId: string;
  entryId: string;
  memberName: string;
  batchName: string;
  trainerName: string;
  sessionDate: string;
  createdAt: string;
  memberStatusAtTime: MemberStatus;
  isPostExpiry: boolean;
}

interface Override {
  present: boolean;
  entryId: string;
  createdAt?: string;
  memberStatusAtTime?: MemberStatus;
  isPostExpiry?: boolean;
}

export function AttendanceLog() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [batchId, setBatchId] = useState("all");
  const [trainerId, setTrainerId] = useState("all");
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: batches } = useQuery({
    queryKey: ["all-batches"],
    queryFn: async () => (await supabase.from("batches").select("*").order("name")).data as Batch[],
  });
  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name")).data as Profile[],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["attendance-log", from, to, batchId, trainerId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_entries")
        .select(
          "id, created_at, member_status_at_time, is_post_expiry, member:members(id, name), attendance_record:attendance_records!inner(id, session_date, batch:batches(name), trainer:profiles(full_name), batch_id, trainer_id)"
        )
        .gte("attendance_record.session_date", from)
        .lte("attendance_record.session_date", to)
        .order("session_date", { foreignTable: "attendance_record", ascending: false });

      if (batchId !== "all") query = query.eq("attendance_record.batch_id", batchId);
      if (trainerId !== "all") query = query.eq("attendance_record.trainer_id", trainerId);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map(
        (e: any): LogRow => ({
          recordId: e.attendance_record.id,
          memberId: e.member.id,
          entryId: e.id,
          memberName: e.member.name,
          batchName: e.attendance_record.batch?.name ?? "—",
          trainerName: e.attendance_record.trainer?.full_name ?? "—",
          sessionDate: e.attendance_record.session_date,
          createdAt: e.created_at,
          memberStatusAtTime: e.member_status_at_time,
          isPostExpiry: e.is_post_expiry,
        })
      );
    },
  });

  function rowKey(r: LogRow) {
    return `${r.recordId}:${r.memberId}`;
  }

  async function toggleRow(row: LogRow) {
    const key = rowKey(row);
    const current = overrides.get(key) ?? { present: true, entryId: row.entryId };
    setBusyKey(key);
    setError(null);
    try {
      if (current.present) {
        const { error: delError } = await supabase.from("attendance_entries").delete().eq("id", current.entryId);
        if (delError) throw delError;
        setOverrides((prev) => new Map(prev).set(key, { present: false, entryId: current.entryId }));
      } else {
        const { data, error: insError } = await supabase
          .from("attendance_entries")
          .insert({ attendance_record_id: row.recordId, member_id: row.memberId, present: true })
          .select("id, created_at, member_status_at_time, is_post_expiry")
          .single();
        if (insError) throw insError;
        setOverrides(
          (prev) =>
            new Map(prev).set(key, {
              present: true,
              entryId: data.id,
              createdAt: data.created_at,
              memberStatusAtTime: data.member_status_at_time,
              isPostExpiry: data.is_post_expiry,
            })
        );
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to update attendance.");
    } finally {
      setBusyKey(null);
    }
  }

  function handleExport() {
    exportToExcel(`attendance-log-${from}_to_${to}.xlsx`, [
      {
        sheetName: "Attendance Log",
        rows: merged
          .filter((r) => r.present)
          .map((r) => ({
            Date: r.sessionDate,
            Name: r.memberName,
            Batch: r.batchName,
            "Time Stamp": r.createdAt,
            "Marked By": r.trainerName,
            "Membership Status": r.memberStatusAtTime,
            "Post-Expiry": r.isPostExpiry ? "Yes" : "No",
          })),
      },
    ]);
  }

  const merged = (rows ?? []).map((r) => {
    const o = overrides.get(rowKey(r));
    return {
      ...r,
      present: o?.present ?? true,
      createdAt: o?.createdAt ?? r.createdAt,
      memberStatusAtTime: o?.memberStatusAtTime ?? r.memberStatusAtTime,
      isPostExpiry: o?.isPostExpiry ?? r.isPostExpiry,
    };
  });

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(merged);
  const presentCount = merged.filter((r) => r.present).length;
  const absentCount = merged.filter((r) => !r.present).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Attendance Log</h1>
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Present" value={presentCount} accent="green" />
        <StatCard label="Absent" value={absentCount} accent="red" />
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

      <p className="text-xs text-white/30">
        Tap a status to correct it — this edits the historical record directly, for any date, not just today.
      </p>
      {error && (
        <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Batch</th>
              <th>Time Stamp</th>
              <th>Marked By</th>
              <th>Membership Status</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => {
              const key = rowKey(r);
              const busy = busyKey === key;
              return (
                <tr key={key} className={!r.present ? "opacity-50" : r.isPostExpiry ? "bg-status-expired/10" : ""}>
                  <td>{formatDate(r.sessionDate)}</td>
                  <td className="font-semibold">
                    {r.isPostExpiry && r.present && "⚠️ "}
                    {r.memberName}
                  </td>
                  <td>{r.batchName}</td>
                  <td className="text-white/40">{new Date(r.createdAt).toLocaleTimeString()}</td>
                  <td>{r.trainerName}</td>
                  <td>
                    <StatusBadge status={r.memberStatusAtTime} />
                  </td>
                  <td>
                    <button
                      onClick={() => toggleRow(r)}
                      disabled={busy}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-bold transition-all",
                        busy
                          ? "cursor-wait border border-base-600 bg-base-800 text-white/30"
                          : r.present
                          ? "bg-accent-green text-base-900 hover:bg-accent-green/80"
                          : "border border-base-500 bg-base-700 text-white/50 hover:border-white/30 hover:text-white"
                      )}
                    >
                      {busy ? "…" : r.present ? "Present" : "Absent"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && merged.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-white/40">
                  No attendance records for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  );
}
