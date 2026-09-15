import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useAllMembers, useAllBatches } from "@/hooks/useTrainerData";
import { useAttendanceSync, getOrCreateRecord } from "@/hooks/useAttendanceSync";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { todayISO, formatDate } from "@/lib/utils";
import type { MemberWithStatus } from "@/lib/database.types";

type MemberWithBatch = MemberWithStatus & {
  batchId: string | null;
  member_batches: { batch_id: string }[];
};

interface DemoVisitorDraft {
  name: string;
  phone: string;
}

export function BatchAttendance() {
  const { batchId } = useParams<{ batchId: string }>();
  const { profile } = useAuth();

  const { data: batches } = useAllBatches();
  const batch = (batches ?? []).find((b) => b.id === batchId);

  const { data: members, isLoading: membersLoading } = useAllMembers();
  const {
    savedEntries,
    savedLoading,
    presentIds,
    toggle,
    flush,
    syncing,
    syncError,
    justSaved,
    pendingCount,
  } = useAttendanceSync(profile?.id);

  const [search, setSearch] = useState("");
  const [demoVisitors, setDemoVisitors] = useState<DemoVisitorDraft[]>([]);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoDraft, setDemoDraft] = useState<DemoVisitorDraft>({ name: "", phone: "" });
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const filtered = ((members ?? []) as MemberWithBatch[]).filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q);
  });

  async function addDemoVisitor() {
    if (!demoDraft.name.trim() || !demoDraft.phone.trim() || !profile || !batchId) return;
    setDemoSubmitting(true);
    setDemoError(null);
    try {
      const recordId = await getOrCreateRecord(profile.id, batchId);
      const { error } = await supabase.from("demo_visitors").insert({
        attendance_record_id: recordId,
        name: demoDraft.name,
        phone: demoDraft.phone,
        visit_date: todayISO(),
      });
      if (error) throw error;
      setDemoVisitors((prev) => [...prev, demoDraft]);
      setDemoDraft({ name: "", phone: "" });
      setShowDemoForm(false);
    } catch (e: any) {
      setDemoError(e.message ?? "Failed to add demo visitor.");
    } finally {
      setDemoSubmitting(false);
    }
  }

  if (membersLoading || savedLoading) {
    return <p className="text-white/50">Loading roster…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/trainer" className="text-xs text-white/40 hover:text-white/70">
          ← Back to today
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Mark Attendance</h1>
        <p className="text-sm text-white/50">
          {batch?.name ?? "Batch"} session · {formatDate(todayISO(), "EEEE, dd MMM yyyy")}
        </p>
        <p className="mt-1 text-xs text-white/30">
          Showing every member. Marking someone present here records it against this batch's session, even if
          they're normally assigned elsewhere. Attendance already marked today in any batch shows as Present.
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />

      <div className="card divide-y divide-base-700">
        {filtered.map((member) => {
          const m = member as MemberWithBatch;
          const isPresent = presentIds.has(m.id);

          return (
            <div
              key={m.id}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                isPresent && "bg-accent-green/5",
                m.status === "expired" && !isPresent && "bg-status-expired/5"
              )}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={clsx(
                    "truncate font-semibold",
                    m.status === "expired" && !isPresent && "text-status-expired"
                  )}
                >
                  {m.status === "expired" && !isPresent && "⚠️ "}
                  {m.name}
                </div>
                <div className="text-xs text-white/40">{m.phone}</div>
              </div>

              <StatusBadge status={m.status} />

              <button
                onClick={() => toggle(m.id, batchId ?? null)}
                disabled={!batchId}
                className={clsx(
                  "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-150",
                  isPresent
                    ? "bg-accent-green text-base-900 shadow-md shadow-accent-green/20 hover:bg-accent-green/80 active:scale-95"
                    : "border border-base-500 bg-base-700 text-white/50 hover:border-white/30 hover:text-white active:scale-95"
                )}
              >
                {isPresent ? "Present" : "Absent"}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-white/40">No members match "{search}"</div>
        )}
      </div>

      {demoVisitors.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/60">Demo Visitors ({demoVisitors.length})</h3>
          <ul className="space-y-1 text-sm">
            {demoVisitors.map((v, i) => (
              <li key={i} className="flex justify-between text-white/80">
                <span>{v.name}</span>
                <span className="text-white/40">{v.phone}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDemoForm ? (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold">Add Demo Visitor</h3>
          <input
            className="input"
            placeholder="Full name"
            value={demoDraft.name}
            onChange={(e) => setDemoDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Phone number"
            value={demoDraft.phone}
            onChange={(e) => setDemoDraft((d) => ({ ...d, phone: e.target.value }))}
          />
          {demoError && <p className="text-sm text-status-expired">{demoError}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={addDemoVisitor} disabled={demoSubmitting}>
              {demoSubmitting ? "Adding…" : "Add"}
            </button>
            <button className="btn-ghost" onClick={() => setShowDemoForm(false)} disabled={demoSubmitting}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setShowDemoForm(true)}>
          + Add Demo Visitor
        </button>
      )}

      <div className="sticky bottom-4 space-y-2">
        {justSaved && (
          <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-center text-sm font-semibold text-accent-green">
            ✓ Attendance saved!
          </div>
        )}
        {syncError && (
          <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
            ⚠ {syncError}
          </div>
        )}
        {pendingCount > 0 && (
          <button className="btn-primary w-full !py-4 text-base" onClick={flush} disabled={syncing}>
            {syncing ? "Saving…" : `Save Changes (${pendingCount} pending)`}
          </button>
        )}
      </div>
    </div>
  );
}
