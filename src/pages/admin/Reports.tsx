import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate, memberStatus, planLabel, planToMonths, statusLabel, todayISO } from "@/lib/utils";
import type { Batch, Branch, Profile } from "@/lib/database.types";

type ReportTab = "monthly" | "exception" | "expired" | "full";

export function Reports() {
  const [tab, setTab] = useState<ReportTab>("monthly");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="flex gap-2 border-b border-base-600">
        {(
          [
            ["monthly", "Monthly Attendance"],
            ["exception", "Exception Report"],
            ["expired", "Weekly Expired List"],
            ["full", "Full Client Report"],
          ] as [ReportTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-4 py-2.5 text-sm font-semibold ${
              tab === key ? "border-b-2 border-accent-green text-accent-green" : "text-white/50 hover:text-white"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "monthly" && <MonthlyAttendanceReport />}
      {tab === "exception" && <ExceptionExportPanel />}
      {tab === "expired" && <ExpiredExportPanel />}
      {tab === "full" && <FullClientReportPanel />}
    </div>
  );
}

function MonthlyAttendanceReport() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [batchId, setBatchId] = useState("all");

  const { data: batches } = useQuery({
    queryKey: ["all-batches"],
    queryFn: async () => (await supabase.from("batches").select("*").order("name")).data as Batch[],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["monthly-attendance-report", month, batchId],
    queryFn: async () => {
      const monthStart = `${month}-01`;
      let query = supabase.from("v_monthly_attendance").select("*").eq("month", monthStart);
      if (batchId !== "all") query = query.eq("batch_id", batchId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = new Map<string, { name: string; sessions: number }>();
  for (const r of rows ?? []) {
    const cur = totals.get(r.member_id) ?? { name: r.member_name, sessions: 0 };
    cur.sessions += r.sessions_attended;
    totals.set(r.member_id, cur);
  }
  const sorted = Array.from(totals.values()).sort((a, b) => b.sessions - a.sessions);

  function handleExport() {
    exportToExcel(`monthly-attendance-${month}.xlsx`, [
      { sheetName: "Monthly Attendance", rows: sorted.map((r) => ({ Member: r.name, "Sessions Attended": r.sessions, Month: month })) },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Month</label>
          <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
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
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Member</th>
              <th>Sessions Attended</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i}>
                <td className="font-semibold">{r.name}</td>
                <td>{r.sessions}</td>
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={2} className="py-8 text-center text-white/40">
                  No attendance recorded for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExceptionExportPanel() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayISO());
  const [trainerId, setTrainerId] = useState("all");

  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name")).data as Profile[],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["exception-export", from, to, trainerId],
    queryFn: async () => {
      let query = supabase
        .from("attendance_entries")
        .select(
          "*, member:members(name, phone), attendance_record:attendance_records!inner(session_date, trainer_id, batch:batches(name), trainer:profiles(full_name))"
        )
        .eq("is_post_expiry", true)
        .gte("attendance_record.session_date", from)
        .lte("attendance_record.session_date", to);
      if (trainerId !== "all") query = query.eq("attendance_record.trainer_id", trainerId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  function handleExport() {
    exportToExcel(`exception-report-${from}_to_${to}.xlsx`, [
      {
        sheetName: "Exception Report",
        rows: (rows ?? []).map((r: any) => ({
          Member: r.member?.name,
          Phone: r.member?.phone,
          Date: r.attendance_record?.session_date,
          Batch: r.attendance_record?.batch?.name,
          Trainer: r.attendance_record?.trainer?.full_name,
        })),
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>
      <p className="text-sm text-white/50">{isLoading ? "Loading…" : `${rows?.length ?? 0} post-expiry attendance events found.`}</p>
    </div>
  );
}

function ExpiredExportPanel() {
  const { data: members, isLoading } = useQuery({
    queryKey: ["expired-members"],
    queryFn: async () => (await supabase.from("v_expired_members").select("*").order("expiry_date", { ascending: false })).data ?? [],
  });

  function handleExport() {
    exportToExcel(`weekly-expired-list-${todayISO()}.xlsx`, [
      {
        sheetName: "Expired Memberships",
        rows: (members ?? []).map((m: any) => ({
          Name: m.name,
          Phone: m.phone,
          Plan: planLabel(m.plan),
          "Expired On": formatDate(m.expiry_date),
        })),
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">
        {isLoading ? "Loading…" : `${members?.length ?? 0} members currently expired as of today.`}
      </p>
      <button className="btn-secondary" onClick={handleExport}>
        Export to Excel
      </button>
    </div>
  );
}

function FullClientReportPanel() {
  const [branchId, setBranchId] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["full-client-report", branchId],
    queryFn: async () => {
      let query = supabase
        .from("members")
        .select(
          "*, branch:branches(name), member_batches(batch:batches(name, category, time_slot, days)), pt_clients(trainer_share_percent, trainer:profiles(full_name)), payments(amount)"
        )
        .order("sheet_person_no", { ascending: true, nullsFirst: false });
      if (branchId !== "all") query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  function buildRows() {
    return (rows ?? []).map((m: any) => {
      const status = memberStatus(m.expiry_date);
      const totalFee = m.total_fee != null ? Number(m.total_fee) : null;
      const totalPaid = (m.payments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const pt = m.pt_clients?.[0];
      const batch = m.member_batches?.[0]?.batch;
      const trainingType = pt ? `PT- ${pt.trainer?.full_name ?? "?"}` : batch ? "Group" : "—";
      const morningEvening = pt
        ? "—"
        : batch?.category === "weekday_evening"
        ? "Evening"
        : batch?.category === "kids"
        ? "Kids"
        : batch?.category === "weekend"
        ? "Weekend"
        : batch
        ? "Morning"
        : "—";
      const caliPercent = m.cali_percent != null ? Number(m.cali_percent) : null;
      const caliRevenue = totalFee != null && caliPercent != null ? (totalFee * caliPercent) / 100 : null;
      const ptRevenue =
        pt && totalFee != null && pt.trainer_share_percent != null ? (totalFee * pt.trainer_share_percent) / 100 : 0;
      const collectionStatus =
        totalFee == null ? "—" : totalPaid >= totalFee ? "Paid" : totalPaid > 0 ? `Partially Paid (₹${totalPaid})` : "Yet to Pay";

      return {
        SNo: m.sheet_person_no != null ? (m.sheet_renewal_no > 1 ? `${m.sheet_person_no}.${m.sheet_renewal_no}` : String(m.sheet_person_no)) : "",
        Name: m.name,
        "Phone Number": m.phone,
        "Email ID": m.email ?? "",
        Branch: m.branch?.name ?? "",
        "Membership start date": formatDate(m.start_date),
        "Membership end date": formatDate(m.expiry_date),
        Status: statusLabel(status),
        "Membership month": planToMonths(m.plan),
        "Total Fees": totalFee ?? "",
        "Collection Status": collectionStatus,
        "Training Type": trainingType,
        "Morning/Evening": morningEvening,
        Batch: batch ? `${batch.name} (${batch.time_slot})` : "",
        "Cali %": caliPercent ?? "",
        "Cali Revenue": caliRevenue != null ? Math.round(caliRevenue) : "",
        "PT Trainer Rev": pt ? Math.round(ptRevenue) : "",
        "Invoice Shared?": m.invoice_shared ? "Yes" : "No",
      };
    });
  }

  function handleExport() {
    exportToExcel(`full-client-report-${todayISO()}.xlsx`, [{ sheetName: "Client List", rows: buildRows() }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="all">All Branches</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" onClick={handleExport} disabled={isLoading}>
          Export to Excel
        </button>
      </div>
      <p className="text-sm text-white/50">
        {isLoading
          ? "Loading…"
          : `${rows?.length ?? 0} members — matches your tracking sheet's columns (SNo, contact info, membership dates, fees, collection status, training type, batch, Cali %, revenue split, invoice shared).`}
      </p>
      <p className="text-xs text-white/30">
        Note: this exports each member's current state (one row per person), not the sheet's per-renewal-term row
        history — full payment history per member is still available on their profile page.
      </p>
    </div>
  );
}
