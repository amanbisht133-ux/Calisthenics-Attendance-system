import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePTClients } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { todayISO, formatDate } from "@/lib/utils";
import { memberStatus } from "@/lib/utils";

export function PTSessions() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients, isLoading } = usePTClients(profile?.id);
  const [search, setSearch] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const { data: todaysSessions } = useQuery({
    queryKey: ["pt-sessions-today", profile?.id, todayISO()],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pt_sessions")
        .select("*")
        .eq("trainer_id", profile!.id)
        .eq("session_date", todayISO());
      if (error) throw error;
      return data ?? [];
    },
  });

  const doneClientIds = new Set((todaysSessions ?? []).map((s: any) => s.pt_client_id));

  async function markDone(ptClientId: string) {
    if (!profile) return;
    setMarkingId(ptClientId);
    try {
      const { error } = await supabase.from("pt_sessions").insert({
        pt_client_id: ptClientId,
        trainer_id: profile.id,
        session_date: todayISO(),
        session_done: true,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["pt-sessions-today", profile.id] });
    } finally {
      setMarkingId(null);
    }
  }

  const filtered = (clients ?? []).filter((c) => c.member.name.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <p className="text-white/50">Loading clients…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Personal Training</h1>
        <p className="text-sm text-white/50">{formatDate(todayISO(), "EEEE, dd MMM yyyy")}</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search PT clients…" />

      <div className="card divide-y divide-base-700">
        {filtered.map(({ id, member }) => {
          const done = doneClientIds.has(id);
          const status = memberStatus(member.expiry_date);
          return (
            <div key={id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{member.name}</div>
                <div className="text-xs text-white/40">{member.phone}</div>
              </div>
              <StatusBadge status={status} />
              <button
                className={done ? "btn-secondary !bg-accent-green/20 !text-accent-green" : "btn-primary"}
                disabled={done || markingId === id}
                onClick={() => markDone(id)}
              >
                {done ? "✓ Session Done" : markingId === id ? "Saving…" : "Mark Done"}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="px-4 py-8 text-center text-white/40">No PT clients found.</div>}
      </div>
    </div>
  );
}
