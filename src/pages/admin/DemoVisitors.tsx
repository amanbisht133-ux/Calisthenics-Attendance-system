import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate, todayISO } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";

const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function DemoVisitors() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());

  const { data: visitors, isLoading } = useQuery({
    queryKey: ["demo-visitors-log", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demo_visitors")
        .select("*, attendance_record:attendance_records(batch:batches(name), trainer:profiles(full_name))")
        .gte("visit_date", from)
        .lte("visit_date", to)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = (visitors ?? []).reduce<Record<string, any[]>>((acc, v) => {
    (acc[v.visit_date] ??= []).push(v);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped);
  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(groupEntries, 10);

  function handleExport() {
    exportToExcel(`demo-visitors-${from}_to_${to}.xlsx`, [
      {
        sheetName: "Demo Visitors",
        rows: (visitors ?? []).map((v: any) => ({
          Date: v.visit_date,
          Name: v.name,
          Phone: v.phone,
          Batch: v.attendance_record?.batch?.name,
          Trainer: v.attendance_record?.trainer?.full_name,
        })),
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Demo Visitors</h1>
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
      </div>

      {isLoading && <p className="text-white/50">Loading…</p>}

      {pageItems.map(([date, list]) => (
        <div key={date} className="card p-4">
          <h3 className="mb-2 font-bold">{formatDate(date, "EEEE, dd MMM yyyy")}</h3>
          <table className="table-shell">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Batch</th>
                <th>Trainer</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold">{v.name}</td>
                  <td>{v.phone}</td>
                  <td>{v.attendance_record?.batch?.name}</td>
                  <td>{v.attendance_record?.trainer?.full_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!isLoading && (visitors ?? []).length === 0 && (
        <p className="text-center text-white/40">No demo visitors in this range.</p>
      )}

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  );
}
