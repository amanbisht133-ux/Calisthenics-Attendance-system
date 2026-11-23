import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useMemberDues, usePTClients } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { MemberFlags } from "@/components/MemberFlags";
import { formatDate, todayISO } from "@/lib/utils";

export function PTSessions() {
  const { profile } = useAuth();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { data: clients, isLoading } = usePTClients(profile?.id, selectedBranchId ?? undefined);
  const { data: dues = new Map<string, number>() } = useMemberDues(selectedBranchId ?? undefined);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!profile || doneClientIds.has(ptClientId)) return;
    setMarkingId(ptClientId);
    setError(null);
    try {
      const { error } = await supabase.from("pt_sessions").insert({
        pt_client_id: ptClientId,
        trainer_id: profile.id,
        session_date: todayISO(),
        session_done: true,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["pt-sessions-today", profile.id] });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save. Try again.");
    } finally {
      setMarkingId(null);
    }
  }

  const sorted = [...(clients ?? [])].sort((a, b) => a.member.name.localeCompare(b.member.name));

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="text-4xl leading-none">Personal training</h1>
        <p className="mt-1 text-sm text-white/50">{formatDate(todayISO(), "EEEE, d MMMM")} · tap a client after their session</p>
      </div>

      <div className="card divide-y divide-white/5 overflow-hidden">
        {isLoading && <div className="px-4 py-8 text-center text-white/40">Loading…</div>}
        {!isLoading && sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-white/40">No personal training clients assigned to you.</div>
        )}
        {sorted.map(({ id, member }) => {
          const done = doneClientIds.has(id);
          return (
            <button
              key={id}
              type="button"
              disabled={done || markingId === id}
              onClick={() => markDone(id)}
              className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/5", done && "bg-accent-green/[0.07]")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{member.name}</span>
                <MemberFlags expiryDate={member.expiry_date} due={dues.get(member.id)} />
              </span>
              <span
                className={clsx(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  done ? "text-base-900" : "border border-white/15 text-white/70"
                )}
                style={done ? { backgroundImage: "linear-gradient(110deg, #ffb15c, #f38320 45%, #e2531a)" } : undefined}
              >
                {done ? "✓ Done today" : markingId === id ? "Saving…" : "Session done"}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-status-expired">{error}</p>}
    </div>
  );
}
