import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { formatDate, todayISO } from "@/lib/utils";
import type { Profile } from "@/lib/database.types";

const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function PTSessionsLog() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [trainerId, setTrainerId] = useState("all");

  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name")).data as Profile[],
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["pt-sessions-log", from, to, trainerId],
    queryFn: async () => {
      let query = supabase
        .from("pt_sessions")
        .select("*, trainer:profiles(full_name), pt_client:pt_clients(member:members(name, phone))")
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: false });
      if (trainerId !== "all") query = query.eq("trainer_id", trainerId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">PT Session Log</h1>

      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Trainer</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s: any) => (
              <tr key={s.id}>
                <td>{formatDate(s.session_date)}</td>
                <td className="font-semibold">{s.pt_client?.member?.name}</td>
                <td>{s.trainer?.full_name}</td>
                <td className="text-accent-green">{s.session_done ? "✓ Done" : "—"}</td>
              </tr>
            ))}
            {!isLoading && (sessions ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-white/40">
                  No PT sessions for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
