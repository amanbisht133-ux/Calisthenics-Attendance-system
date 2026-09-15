import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBatchMembers, useTodaysAttendanceRecord } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { todayISO, formatDate } from "@/lib/utils";

interface DemoVisitorDraft {
  name: string;
  phone: string;
}

export function BatchAttendance() {
  const { batchId } = useParams<{ batchId: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useBatchMembers(batchId);
  const { data: existingRecord, isLoading: recordLoading } = useTodaysAttendanceRecord(batchId, profile?.id);

  const [search, setSearch] = useState("");
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [demoVisitors, setDemoVisitors] = useState<DemoVisitorDraft[]>([]);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoDraft, setDemoDraft] = useState<DemoVisitorDraft>({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const filteredMembers = (members ?? []).filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  function startEditing() {
    const currentPresent = new Set<string>(
      (existingRecord?.entries ?? []).filter((e: any) => e.present).map((e: any) => e.member_id)
    );
    setPresentIds(currentPresent);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setPresentIds(new Set());
    setError(null);
  }

  function toggleMember(id: string) {
    setPresentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addDemoVisitor() {
    if (!demoDraft.name.trim() || !demoDraft.phone.trim()) return;
    setDemoVisitors((prev) => [...prev, demoDraft]);
    setDemoDraft({ name: "", phone: "" });
    setShowDemoForm(false);
  }

  async function submitAttendance() {
    if (!batchId || !profile) return;
    setSubmitting(true);
    setError(null);

    try {
      let recordId: string;

      if (editing && existingRecord) {
        recordId = existingRecord.id;

        const originalPresent: Map<string, string> = new Map(
          (existingRecord.entries ?? [])
            .filter((e: any) => e.present)
            .map((e: any) => [e.member_id, e.id])
        );

        const toAdd = Array.from(presentIds).filter((id) => !originalPresent.has(id));
        const toRemove = Array.from(originalPresent.keys()).filter((id) => !presentIds.has(id));

        if (toAdd.length > 0) {
          const entries = toAdd.map((member_id) => ({
            attendance_record_id: recordId,
            member_id,
            present: true,
          }));
          const { error: entriesError } = await supabase.from("attendance_entries").insert(entries);
          if (entriesError) throw entriesError;
        }

        if (toRemove.length > 0) {
          const entryIds = toRemove.map((id) => originalPresent.get(id)!);
          const { error: removeError } = await supabase.from("attendance_entries").delete().in("id", entryIds);
          if (removeError) throw removeError;
        }
      } else {
        const { data: record, error: recordError } = await supabase
          .from("attendance_records")
          .insert({ batch_id: batchId, trainer_id: profile.id, session_date: todayISO() })
          .select()
          .single();
        if (recordError) throw recordError;
        recordId = record.id;

        if (presentIds.size > 0) {
          const entries = Array.from(presentIds).map((member_id) => ({
            attendance_record_id: recordId,
            member_id,
            present: true,
          }));
          const { error: entriesError } = await supabase.from("attendance_entries").insert(entries);
          if (entriesError) throw entriesError;
        }
      }

      if (demoVisitors.length > 0) {
        const visitors = demoVisitors.map((v) => ({
          attendance_record_id: recordId,
          name: v.name,
          phone: v.phone,
          visit_date: todayISO(),
        }));
        const { error: demoError } = await supabase.from("demo_visitors").insert(visitors);
        if (demoError) throw demoError;
      }

      await queryClient.invalidateQueries({ queryKey: ["attendance-record", batchId, profile.id] });
      setEditing(false);
      setDemoVisitors([]);
    } catch (e: any) {
      setError(e.message ?? "Failed to submit attendance.");
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = !!existingRecord && !editing;

  if (isLoading || recordLoading) {
    return <p className="text-white/50">Loading roster…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/trainer" className="text-xs text-white/40 hover:text-white/70">
            ← Back to today
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Mark Attendance</h1>
          <p className="text-sm text-white/50">{formatDate(todayISO(), "EEEE, dd MMM yyyy")}</p>
        </div>
        {isLocked && (
          <span className="rounded-full border border-accent-green/40 bg-accent-green/10 px-3 py-1.5 text-xs font-semibold text-accent-green">
            🔒 Submitted at {new Date(existingRecord.submitted_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {isLocked ? (
        <LockedSummary record={existingRecord} members={members ?? []} onEdit={startEditing} />
      ) : (
        <>
          {editing && (
            <div className="flex items-center justify-between rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange">
              <span>Editing today's submitted attendance</span>
              <button className="btn-ghost !py-1 text-xs" onClick={cancelEditing}>
                Cancel
              </button>
            </div>
          )}

          <SearchBar value={search} onChange={setSearch} />

          <div className="card divide-y divide-base-700">
            {filteredMembers.map((member) => {
              const checked = presentIds.has(member.id);
              const expired = member.status === "expired";
              return (
                <label
                  key={member.id}
                  className={clsx(
                    "flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors",
                    expired && "bg-status-expired/10"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(member.id)}
                    className="h-6 w-6 shrink-0 rounded border-2 border-base-500 accent-accent-green"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={clsx("truncate font-semibold", expired && "text-status-expired")}>
                      {expired && "⚠️ "}
                      {member.name}
                    </div>
                    <div className="text-xs text-white/40">{member.phone}</div>
                  </div>
                  <StatusBadge status={member.status} />
                </label>
              );
            })}
            {filteredMembers.length === 0 && (
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
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={addDemoVisitor}>
                  Add
                </button>
                <button className="btn-ghost" onClick={() => setShowDemoForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary w-full" onClick={() => setShowDemoForm(true)}>
              + Add Demo Visitor
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
              {error}
            </div>
          )}

          <button className="btn-primary sticky bottom-4 w-full !py-4 text-base" onClick={submitAttendance} disabled={submitting}>
            {submitting
              ? "Saving…"
              : editing
              ? `Save Changes (${presentIds.size} present)`
              : `Submit Attendance (${presentIds.size} present)`}
          </button>
        </>
      )}
    </div>
  );
}

function LockedSummary({ record, members, onEdit }: { record: any; members: any[]; onEdit: () => void }) {
  const presentEntries = (record.entries ?? []).filter((e: any) => e.present);
  const presentSet = new Set(presentEntries.map((e: any) => e.member_id));
  const demoVisitors = record.demo_visitors ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/60">
            Present ({presentEntries.length}/{members.length})
          </h3>
          <button className="btn-secondary !py-1 text-xs" onClick={onEdit}>
            Edit Attendance
          </button>
        </div>
        <ul className="divide-y divide-base-700">
          {members
            .filter((m) => presentSet.has(m.id))
            .map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span className="font-semibold">{m.name}</span>
                <StatusBadge status={m.status} />
              </li>
            ))}
        </ul>
      </div>
      {demoVisitors.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/60">Demo Visitors ({demoVisitors.length})</h3>
          <ul className="space-y-1 text-sm">
            {demoVisitors.map((v: any) => (
              <li key={v.id} className="flex justify-between text-white/80">
                <span>{v.name}</span>
                <span className="text-white/40">{v.phone}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-center text-xs text-white/30">
        Submitted attendance can still be corrected today. It locks permanently after midnight for audit purposes.
      </p>
    </div>
  );
}
