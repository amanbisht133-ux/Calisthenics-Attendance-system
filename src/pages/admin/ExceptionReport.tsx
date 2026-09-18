import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import type { ExceptionReportRow } from "@/lib/database.types";

export function ExceptionReport() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["exception-report"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_exception_report").select("*");
      if (error) throw error;
      return (data ?? []) as ExceptionReportRow[];
    },
  });

  function handleExport() {
    const exportRows: Record<string, unknown>[] = [];
    for (const r of rows ?? []) {
      r.offense_dates.forEach((date, i) => {
        exportRows.push({
          Member: r.member_name,
          Phone: r.phone,
          "Membership Expired": r.expiry_date,
          "Total Post-Expiry Attendances": r.post_expiry_count,
          "Offense Date": date,
          Batch: r.batch_names[i],
        });
      });
    }
    exportToExcel(`exception-report-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { sheetName: "Exception Report", rows: exportRows },
    ]);
  }

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(rows ?? []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">⚠️ Exception Report</h1>
          <p className="text-sm text-white/50">Members who attended after their membership expired</p>
        </div>
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>

      <div className="space-y-3">
        {pageItems.map((r) => (
          <div key={r.member_id} className="card border-status-expired/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to={`/admin/members/${r.member_id}`} className="font-bold hover:underline">
                  {r.member_name}
                </Link>
                <p className="text-xs text-white/40">
                  {r.phone} · Expired {formatDate(r.expiry_date)}
                </p>
              </div>
              <span className="rounded-full bg-status-expired/15 px-3 py-1 text-sm font-bold text-status-expired">
                {r.post_expiry_count}× post-expiry
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.offense_dates.map((date, i) => (
                <span key={i} className="rounded bg-base-700 px-2 py-1 text-xs text-white/60">
                  {formatDate(date)} · {r.batch_names[i]}
                </span>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && (rows ?? []).length === 0 && (
          <p className="py-8 text-center text-white/40">No exceptions found — clean record. 🎉</p>
        )}
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  );
}
