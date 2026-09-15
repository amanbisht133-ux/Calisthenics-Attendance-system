import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { formatDate, memberStatus, planLabel, todayISO } from "@/lib/utils";
import type { MembershipPlan } from "@/lib/database.types";

export function MemberProfile() {
  const { memberId } = useParams<{ memberId: string }>();
  const queryClient = useQueryClient();
  const [showRenew, setShowRenew] = useState(false);
  const [showBatchAssign, setShowBatchAssign] = useState(false);

  const { data: member, isLoading } = useQuery({
    queryKey: ["member", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, member_batches(batch:batches(id, name, time_slot)), pt_clients(trainer:profiles(full_name))")
        .eq("id", memberId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["member-attendance", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("*, attendance_record:attendance_records(session_date, batch:batches(name))")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || !member) return <p className="text-white/50">Loading member…</p>;

  const status = memberStatus(member.expiry_date);

  return (
    <div className="space-y-6">
      <Link to="/admin/members" className="text-xs text-white/40 hover:text-white/70">
        ← Back to Members
      </Link>

      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">{member.name}</h1>
          <p className="text-sm text-white/50">{member.phone}</p>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-white/40">Plan</p>
          <p className="font-semibold">{planLabel(member.plan)}</p>
          <p className="mt-2 text-xs uppercase text-white/40">Expires</p>
          <p className="font-semibold">{formatDate(member.expiry_date)}</p>
          <button className="btn-primary mt-3" onClick={() => setShowRenew(true)}>
            Renew Membership
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Batch</h2>
          {member.member_batches?.length > 0 ? (
            <div className="text-sm text-white/80">
              {member.member_batches[0]?.batch?.name}
              <span className="ml-2 text-white/40">{member.member_batches[0]?.batch?.time_slot}</span>
            </div>
          ) : (
            <p className="text-sm text-white/40">Not assigned to any batch.</p>
          )}
          <button
            className="btn-secondary mt-3 text-xs"
            onClick={() => setShowBatchAssign(true)}
          >
            {member.member_batches?.length > 0 ? "Change Batch" : "+ Assign Batch"}
          </button>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Personal Training</h2>
          {member.pt_clients?.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {member.pt_clients.map((pc: any, i: number) => (
                <li key={i} className="text-white/80">
                  Trainer: {pc.trainer?.full_name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/40">No PT sessions.</p>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-bold">Attendance History</h2>
        <table className="table-shell">
          <thead>
            <tr>
              <th>Date</th>
              <th>Batch</th>
              <th>Status at Time</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((h: any) => (
              <tr key={h.id} className={h.is_post_expiry ? "bg-status-expired/10" : ""}>
                <td>{formatDate(h.attendance_record?.session_date)}</td>
                <td>{h.attendance_record?.batch?.name}</td>
                <td>
                  {h.is_post_expiry && "⚠️ "}
                  <StatusBadge status={h.member_status_at_time} />
                </td>
              </tr>
            ))}
            {(history ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-white/40">
                  No attendance recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showRenew && (
        <RenewModal
          member={member}
          onClose={() => setShowRenew(false)}
          onRenewed={() => {
            setShowRenew(false);
            queryClient.invalidateQueries({ queryKey: ["member", memberId] });
            queryClient.invalidateQueries({ queryKey: ["admin-members"] });
          }}
        />
      )}

      {showBatchAssign && (
        <BatchAssignModal
          member={member}
          onClose={() => setShowBatchAssign(false)}
          onAssigned={() => {
            setShowBatchAssign(false);
            queryClient.invalidateQueries({ queryKey: ["member", memberId] });
            queryClient.invalidateQueries({ queryKey: ["all-members"] });
          }}
        />
      )}
    </div>
  );
}

function RenewModal({ member, onClose, onRenewed }: { member: any; onClose: () => void; onRenewed: () => void }) {
  const [plan, setPlan] = useState<MembershipPlan>(member.plan);
  const [startDate, setStartDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRenew() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("members").update({ plan, start_date: startDate }).eq("id", member.id);
      if (error) throw error;
      onRenewed();
    } catch (e: any) {
      setError(e.message ?? "Failed to renew.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Renew — ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Plan</label>
          <select className="input" value={plan} onChange={(e) => setPlan(e.target.value as MembershipPlan)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-Yearly</option>
          </select>
        </div>
        <div>
          <label className="label">New Start Date</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <p className="text-xs text-white/40">Expiry date will be recalculated automatically.</p>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleRenew} disabled={saving}>
          {saving ? "Renewing…" : "Confirm Renewal"}
        </button>
      </div>
    </Modal>
  );
}

function BatchAssignModal({
  member,
  onClose,
  onAssigned,
}: {
  member: any;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const currentBatchId = member.member_batches?.[0]?.batch?.id ?? "";
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(currentBatchId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedBatchIds = new Set<string>(
    (member.member_batches ?? []).map((mb: any) => mb.batch?.id).filter(Boolean)
  );

  useState(() => {
    supabase
      .from("batches")
      .select("id, name, time_slot, days")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setBatches(data ?? []);
        if (!selectedBatchId && data && data.length > 0) setSelectedBatchId(data[0].id);
      });
  });

  async function handleAssign() {
    if (!selectedBatchId) return;
    setSaving(true);
    setError(null);
    try {
      // Remove existing batch assignment first
      await supabase
        .from("member_batches")
        .delete()
        .eq("member_id", member.id);

      const { error } = await supabase
        .from("member_batches")
        .insert({ member_id: member.id, batch_id: selectedBatchId });
      if (error) throw error;
      onAssigned();
    } catch (e: any) {
      setError(e.message ?? "Failed to assign batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Assign Batch — ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        {batches.length === 0 ? (
          <p className="text-sm text-white/40">No available batches to assign.</p>
        ) : (
          <>
            <div>
              <label className="label">Batch</label>
              <select
                className="input"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.time_slot} ({b.days})
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-status-expired">{error}</p>}
            <button
              className="btn-primary w-full"
              onClick={handleAssign}
              disabled={saving || !selectedBatchId}
            >
              {saving ? "Assigning…" : "Assign Batch"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
