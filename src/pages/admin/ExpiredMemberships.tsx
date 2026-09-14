import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { exportToExcel } from "@/lib/xlsxExport";
import { formatDate, planLabel } from "@/lib/utils";

export function ExpiredMemberships() {
  const [search, setSearch] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["expired-members"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_expired_members").select("*").order("expiry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (members ?? []).filter((m: any) => m.name.toLowerCase().includes(search.toLowerCase()));

  function handleExport() {
    exportToExcel(`expired-memberships-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        sheetName: "Expired Memberships",
        rows: filtered.map((m: any) => ({
          Name: m.name,
          Phone: m.phone,
          Plan: planLabel(m.plan),
          "Expired On": m.expiry_date,
          "Days Since Expiry": Math.round((Date.now() - new Date(m.expiry_date).getTime()) / 86_400_000),
        })),
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🔴 Expired Memberships</h1>
          <p className="text-sm text-white/50">{members?.length ?? 0} members currently expired — live view</p>
        </div>
        <button className="btn-secondary" onClick={handleExport}>
          Export to Excel
        </button>
      </div>

      <SearchBar value={search} onChange={setSearch} />

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Expired On</th>
              <th>Days Overdue</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m: any) => (
              <tr key={m.id} className="cursor-pointer bg-status-expired/5 hover:bg-status-expired/15">
                <td>
                  <Link to={`/admin/members/${m.id}`} className="font-semibold text-status-expired hover:underline">
                    ⚠️ {m.name}
                  </Link>
                </td>
                <td>{m.phone}</td>
                <td>{planLabel(m.plan)}</td>
                <td>{formatDate(m.expiry_date)}</td>
                <td className="font-bold text-status-expired">
                  {Math.round((Date.now() - new Date(m.expiry_date).getTime()) / 86_400_000)}d
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-white/40">
                  No expired memberships. 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
