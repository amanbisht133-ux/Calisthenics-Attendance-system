import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { formatDate, memberStatus, planLabel, paymentStatus, paymentStatusLabel, todayISO } from "@/lib/utils";
import { syncMemberToSheet } from "@/lib/sheetSync";
import type { MembershipPlan } from "@/lib/database.types";

export function MemberProfile() {
  const { memberId } = useParams<{ memberId: string }>();
  const queryClient = useQueryClient();
  const [showRenew, setShowRenew] = useState(false);
  const [showBatchAssign, setShowBatchAssign] = useState(false);
  const [showBranchChange, setShowBranchChange] = useState(false);
  const [showSheetFix, setShowSheetFix] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const { data: member, isLoading } = useQuery({
    queryKey: ["member", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select(
          "*, branch:branches(id, name), member_batches(batch:batches(id, name, time_slot)), pt_clients(id, trainer_share_percent, trainer:profiles(id, full_name))"
        )
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

  const { data: payments } = useQuery({
    queryKey: ["member-payments", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("member_id", memberId)
        .order("paid_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || !member) return <p className="text-white/50">Loading member…</p>;

  const totalPaid = (payments ?? []).reduce((sum, p: any) => sum + Number(p.amount), 0);
  const balance = member.total_fee != null ? Number(member.total_fee) - totalPaid : null;
  const payStatus = paymentStatus(member.total_fee, totalPaid);

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
          <EmailField member={member} memberId={memberId!} />
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-white/40">Plan</p>
          <p className="font-semibold">{planLabel(member.plan)}</p>
          <p className="mt-2 text-xs uppercase text-white/40">Expires</p>
          <EndDateField member={member} memberId={memberId!} />
          <button className="btn-primary mt-3" onClick={() => setShowRenew(true)}>
            Renew Membership
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Branch</h2>
          <p className="text-sm text-white/80">{member.branch?.name ?? "Not assigned."}</p>
          <button className="btn-secondary mt-3 text-xs" onClick={() => setShowBranchChange(true)}>
            Change Branch
          </button>
        </div>
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
                  {pc.trainer_share_percent != null && (
                    <span className="text-white/40"> · {pc.trainer_share_percent}% share</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/40">No PT sessions.</p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Spreadsheet SNo</h2>
          <p className="text-sm text-white/80">
            {member.sheet_person_no != null
              ? member.sheet_renewal_no > 1
                ? `${member.sheet_person_no}.${member.sheet_renewal_no}`
                : String(member.sheet_person_no)
              : "Not synced yet."}
          </p>
          <button className="btn-secondary mt-3 text-xs" onClick={() => setShowSheetFix(true)}>
            Fix Number
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Payments</h2>
            {member.total_fee != null ? (
              <p className="mt-1 text-sm text-white/60">
                ₹{totalPaid.toLocaleString()} paid of ₹{Number(member.total_fee).toLocaleString()}
                {balance! > 0 && <span className="text-status-expired"> · ₹{balance!.toLocaleString()} due</span>}
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/40">No fee set for this member.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                payStatus === "paid"
                  ? "border-status-active/30 bg-status-active/15 text-status-active"
                  : payStatus === "partial"
                  ? "border-status-expiring/30 bg-status-expiring/15 text-status-expiring"
                  : "border-status-expired/30 bg-status-expired/15 text-status-expired"
              }`}
            >
              {paymentStatusLabel(payStatus)}
            </span>
            {member.total_fee != null && payStatus !== "paid" && (
              <button className="btn-secondary !py-1.5 text-xs" onClick={() => setShowAddPayment(true)}>
                + Add Payment
              </button>
            )}
          </div>
        </div>

        <RevenueFieldsRow member={member} memberId={memberId!} />

        {(payments ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-base-700 border-t border-base-700">
            {(payments ?? []).map((p: any) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-white/70">{p.paid_date}</span>
                <span className="font-semibold">₹{Number(p.amount).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
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

      {showBranchChange && (
        <BranchChangeModal
          member={member}
          onClose={() => setShowBranchChange(false)}
          onChanged={() => {
            setShowBranchChange(false);
            queryClient.invalidateQueries({ queryKey: ["member", memberId] });
            queryClient.invalidateQueries({ queryKey: ["admin-members"] });
            queryClient.invalidateQueries({ queryKey: ["all-members"] });
          }}
        />
      )}

      {showSheetFix && (
        <SheetFixModal
          member={member}
          onClose={() => setShowSheetFix(false)}
          onFixed={() => {
            setShowSheetFix(false);
            queryClient.invalidateQueries({ queryKey: ["member", memberId] });
          }}
        />
      )}

      {showAddPayment && (
        <AddPaymentModal
          member={member}
          balance={balance}
          onClose={() => setShowAddPayment(false)}
          onAdded={() => {
            setShowAddPayment(false);
            queryClient.invalidateQueries({ queryKey: ["member-payments", memberId] });
          }}
        />
      )}
    </div>
  );
}

function AddPaymentModal({
  member,
  balance,
  onClose,
  onAdded,
}: {
  member: any;
  balance: number | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [amount, setAmount] = useState(balance != null ? String(balance) : "");
  const [paidDate, setPaidDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const value = Number(amount);
    if (!amount.trim() || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("payments")
        .insert({ member_id: member.id, amount: value, paid_date: paidDate });
      if (error) throw error;
      onAdded();
    } catch (e: any) {
      setError(e.message ?? "Failed to add payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Add Payment — ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {balance != null && <p className="mt-1 text-xs text-white/30">₹{balance.toLocaleString()} currently due.</p>}
        </div>
        <div>
          <label className="label">Date Paid</label>
          <input type="date" className="input" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Add Payment"}
        </button>
      </div>
    </Modal>
  );
}

function SheetFixModal({ member, onClose, onFixed }: { member: any; onClose: () => void; onFixed: () => void }) {
  const [personNo, setPersonNo] = useState<string>(member.sheet_person_no != null ? String(member.sheet_person_no) : "");
  const [renewalNo, setRenewalNo] = useState(member.sheet_renewal_no ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("members")
        .update({
          sheet_person_no: personNo.trim() === "" ? null : Number(personNo),
          sheet_renewal_no: renewalNo,
        })
        .eq("id", member.id);
      if (error) throw error;
      onFixed();
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Fix Spreadsheet Number — ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-white/40">
          Sets what this member's number is <em>recorded as</em> in the app so future renewals continue it
          correctly (e.g. next renewal becomes person.renewal+1). This doesn't touch the spreadsheet itself — check
          the sheet for the right values first, then match them here.
        </p>
        <div>
          <label className="label">Person Number</label>
          <input
            className="input"
            placeholder="e.g. 178 — leave blank if never synced"
            value={personNo}
            onChange={(e) => setPersonNo(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Renewal Number</label>
          <input
            type="number"
            min={1}
            className="input"
            value={renewalNo}
            onChange={(e) => setRenewalNo(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-white/30">1 = shows as plain "178" in the sheet; 2 = "178.2"; etc.</p>
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function BranchChangeModal({ member, onClose, onChanged }: { member: any; onClose: () => void; onChanged: () => void }) {
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState(member.branch?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => setBranches(data ?? []));
  });

  async function handleChange() {
    if (!branchId) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("members").update({ branch_id: branchId }).eq("id", member.id);
      if (error) throw error;

      // Batch assignments belong to the old branch — clear them so the member
      // doesn't stay linked to a batch outside their new branch.
      if (branchId !== member.branch?.id) {
        await supabase.from("member_batches").delete().eq("member_id", member.id);
      }

      onChanged();
    } catch (e: any) {
      setError(e.message ?? "Failed to change branch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Change Branch — ${member.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-white/40">
          Moving branches clears this member's current batch assignment, since batches belong to a specific branch.
        </p>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleChange} disabled={saving || !branchId}>
          {saving ? "Saving…" : "Save Branch"}
        </button>
      </div>
    </Modal>
  );
}

function RevenueFieldsRow({ member, memberId }: { member: any; memberId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [caliPercent, setCaliPercent] = useState(member.cali_percent != null ? String(member.cali_percent) : "");
  const [invoiceShared, setInvoiceShared] = useState(!!member.invoice_shared);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await supabase
        .from("members")
        .update({
          cali_percent: caliPercent.trim() ? Number(caliPercent) : null,
          invoice_shared: invoiceShared,
        })
        .eq("id", memberId);
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleInvoiceShared(checked: boolean) {
    setInvoiceShared(checked);
    await supabase.from("members").update({ invoice_shared: checked }).eq("id", memberId);
    queryClient.invalidateQueries({ queryKey: ["member", memberId] });
  }

  if (editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-base-700 pt-3 text-sm">
        <label className="flex items-center gap-2">
          Cali %
          <input
            type="number"
            min="0"
            max="100"
            className="input !w-20 !py-1"
            value={caliPercent}
            onChange={(e) => setCaliPercent(e.target.value)}
          />
        </label>
        <button className="btn-primary !px-3 !py-1 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Save"}
        </button>
        <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-base-700 pt-3 text-sm text-white/70">
      <span>
        Cali %: <strong className="text-white">{member.cali_percent ?? "—"}</strong>{" "}
        <button className="text-xs text-accent-green hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </span>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={invoiceShared}
          onChange={(e) => toggleInvoiceShared(e.target.checked)}
          className="h-4 w-4 rounded border-2 border-base-500 accent-accent-green"
        />
        Invoice Shared
      </label>
    </div>
  );
}

function EmailField({ member, memberId }: { member: any; memberId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(member.email ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await supabase.from("members").update({ email: email.trim() || null }).eq("id", memberId);
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-2">
        <input
          type="email"
          className="input !py-1 text-sm"
          placeholder="member@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <button className="btn-primary !px-3 !py-1 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Save"}
        </button>
        <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <p className="text-sm text-white/50">
      {member.email ?? <span className="text-white/30">No email on file</span>}{" "}
      <button className="text-xs text-accent-green hover:underline" onClick={() => setEditing(true)}>
        Edit
      </button>
    </p>
  );
}

function EndDateField({ member, memberId }: { member: any; memberId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [expiryDate, setExpiryDate] = useState(member.expiry_date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!expiryDate) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("members").update({ expiry_date: expiryDate }).eq("id", memberId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      setEditing(false);
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input !py-1 text-sm"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            autoFocus
          />
          <button className="btn-primary !px-3 !py-1 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? "…" : "Save"}
          </button>
          <button
            className="btn-ghost !px-3 !py-1 text-xs"
            onClick={() => {
              setEditing(false);
              setExpiryDate(member.expiry_date);
              setError(null);
            }}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-status-expired">{error}</p>}
      </div>
    );
  }

  return (
    <p className="font-semibold">
      {formatDate(member.expiry_date)}{" "}
      <button className="text-xs font-normal text-accent-green hover:underline" onClick={() => setEditing(true)}>
        Edit
      </button>
    </p>
  );
}

function RenewModal({ member, onClose, onRenewed }: { member: any; onClose: () => void; onRenewed: () => void }) {
  const [plan, setPlan] = useState<MembershipPlan>(member.plan);
  const [startDate, setStartDate] = useState(todayISO());
  const [trainingType, setTrainingType] = useState<"group" | "pt">(
    member.pt_clients?.length > 0 ? "pt" : "group"
  );
  const [batches, setBatches] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(member.member_batches?.[0]?.batch?.id ?? "");
  const [ptTrainerId, setPtTrainerId] = useState(member.pt_clients?.[0]?.trainer?.id ?? "");
  const [ptTrainerShare, setPtTrainerShare] = useState(
    member.pt_clients?.[0]?.trainer_share_percent != null ? String(member.pt_clients[0].trainer_share_percent) : ""
  );
  const [totalFee, setTotalFee] = useState(member.total_fee != null ? String(member.total_fee) : "");
  const [paymentChoice, setPaymentChoice] = useState<"paid" | "partial" | "unpaid">("paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetWarning, setSheetWarning] = useState<string | null>(null);

  useState(() => {
    supabase
      .from("batches")
      .select("id, name, time_slot, days")
      .eq("status", "active")
      .eq("branch_id", member.branch?.id)
      .order("name")
      .then(({ data }) => setBatches(data ?? []));

    supabase
      .from("trainer_branches")
      .select("trainer:profiles(id, full_name)")
      .eq("branch_id", member.branch?.id)
      .then(({ data }) => setTrainers((data ?? []).map((r: any) => r.trainer).filter(Boolean)));
  });

  async function handleRenew() {
    setError(null);

    const totalFeeValue = totalFee.trim() ? Number(totalFee) : null;
    if (totalFeeValue !== null && totalFeeValue <= 0) {
      setError("Total fee must be greater than 0, or left blank.");
      return;
    }
    let paidAmount = 0;
    if (totalFeeValue !== null) {
      if (paymentChoice === "paid") {
        paidAmount = totalFeeValue;
      } else if (paymentChoice === "partial") {
        paidAmount = Number(amountPaid);
        if (!amountPaid.trim() || paidAmount <= 0 || paidAmount >= totalFeeValue) {
          setError("Partial payment must be greater than 0 and less than the total fee.");
          return;
        }
      }
    }
    let shareValue: number | null = null;
    if (trainingType === "pt" && ptTrainerShare.trim()) {
      shareValue = Number(ptTrainerShare);
      if (shareValue < 0 || shareValue > 100) {
        setError("Trainer share must be between 0 and 100.");
        return;
      }
    }

    setSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from("members")
        .update({ plan, start_date: startDate, total_fee: totalFeeValue })
        .eq("id", member.id)
        .select()
        .single();
      if (error) throw error;

      if (paidAmount > 0) {
        const { error: paymentError } = await supabase
          .from("payments")
          .insert({ member_id: member.id, amount: paidAmount, paid_date: todayISO() });
        if (paymentError) throw paymentError;
      }

      if (trainingType === "group") {
        await supabase.from("pt_clients").delete().eq("member_id", member.id);
        await supabase.from("member_batches").delete().eq("member_id", member.id);
        if (selectedBatchId) {
          const { error: batchError } = await supabase
            .from("member_batches")
            .insert({ member_id: member.id, batch_id: selectedBatchId });
          if (batchError) throw batchError;
        }
      } else {
        await supabase.from("member_batches").delete().eq("member_id", member.id);
        await supabase.from("pt_clients").delete().eq("member_id", member.id);
        if (ptTrainerId) {
          const { error: ptError } = await supabase
            .from("pt_clients")
            .insert({ member_id: member.id, trainer_id: ptTrainerId, trainer_share_percent: shareValue });
          if (ptError) throw ptError;
        }
      }

      const sync = await syncMemberToSheet(updated, true);
      if (!sync.ok) {
        setSheetWarning(sync.error);
        setSaving(false);
        return;
      }

      onRenewed();
    } catch (e: any) {
      setError(e.message ?? "Failed to renew.");
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

        <div>
          <label className="label">Total Fee (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input"
            placeholder="e.g. 5555"
            value={totalFee}
            onChange={(e) => setTotalFee(e.target.value)}
          />
        </div>
        {totalFee.trim() && (
          <div>
            <label className="label">Payment Status</label>
            <div className="grid grid-cols-3 gap-2">
              {(["paid", "partial", "unpaid"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors ${
                    paymentChoice === choice
                      ? "border-accent-green bg-accent-green/10 text-accent-green"
                      : "border-base-600 text-white/50 hover:text-white"
                  }`}
                  onClick={() => setPaymentChoice(choice)}
                >
                  {choice === "paid" ? "Paid in Full" : choice === "partial" ? "Partially Paid" : "Not Paid Yet"}
                </button>
              ))}
            </div>
            {paymentChoice === "partial" && (
              <input
                type="number"
                min="0"
                step="0.01"
                className="input mt-2"
                placeholder="Amount paid so far"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            )}
          </div>
        )}

        <div>
          <label className="label">Training Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                trainingType === "group"
                  ? "border-accent-green bg-accent-green/10 text-accent-green"
                  : "border-base-600 text-white/50 hover:text-white"
              }`}
              onClick={() => setTrainingType("group")}
            >
              Group (batch)
            </button>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                trainingType === "pt"
                  ? "border-accent-green bg-accent-green/10 text-accent-green"
                  : "border-base-600 text-white/50 hover:text-white"
              }`}
              onClick={() => setTrainingType("pt")}
            >
              Personal Training
            </button>
          </div>
        </div>

        {trainingType === "group" ? (
          <div>
            <label className="label">Batch</label>
            <select className="input" value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}>
              <option value="">— None —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.time_slot} ({b.days})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Trainer</label>
            <select className="input" value={ptTrainerId} onChange={(e) => setPtTrainerId(e.target.value)}>
              <option value="">— Select a trainer —</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <div className="mt-3">
              <label className="label">Trainer Share of Fee (% — optional)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                className="input"
                placeholder="e.g. 30"
                value={ptTrainerShare}
                onChange={(e) => setPtTrainerShare(e.target.value)}
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-status-expired">{error}</p>}
        {sheetWarning ? (
          <>
            <p className="text-sm text-accent-orange">
              Renewal saved, but couldn't sync to the spreadsheet: {sheetWarning}
            </p>
            <button className="btn-primary w-full" onClick={onRenewed}>
              Continue
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={handleRenew} disabled={saving}>
            {saving ? "Renewing…" : "Confirm Renewal"}
          </button>
        )}
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
      .eq("branch_id", member.branch?.id)
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
