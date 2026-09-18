import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { formatDate, memberStatus, planLabel, todayISO } from "@/lib/utils";
import { syncMemberToSheet } from "@/lib/sheetSync";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import type { Batch, Branch, MembershipPlan } from "@/lib/database.types";

export function Members() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showSheetSettings, setShowSheetSettings] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, branch:branches(id, name), member_batches(batch:batches(id, name))")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((m: any) => ({ ...m, status: memberStatus(m.expiry_date) }));
    },
  });

  const { data: batches } = useQuery({
    queryKey: ["all-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Batch[];
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const filtered = (members ?? []).filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (planFilter !== "all" && m.plan !== planFilter) return false;
    if (branchFilter !== "all" && m.branch_id !== branchFilter) return false;
    if (batchFilter !== "all" && !m.member_batches.some((mb: any) => mb.batch?.id === batchFilter)) return false;
    return true;
  });

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(filtered);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-sm text-white/50">{members?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowSheetSettings(true)}>
            ⚙ Spreadsheet Sync
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add Member
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
        </select>
        <select className="input" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
          <option value="all">All Plans</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="half_yearly">Half-Yearly</option>
        </select>
        <select className="input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="all">All Branches</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input sm:col-span-3" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
          <option value="all">All Batches</option>
          {(batches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Branch</th>
              <th>Plan</th>
              <th>Expiry</th>
              <th>Status</th>
              <th>Batches</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((m) => (
              <tr key={m.id} className="cursor-pointer hover:bg-base-700/50" onClick={() => navigate(`/admin/members/${m.id}`)}>
                <td className="font-semibold">{m.name}</td>
                <td>{m.phone}</td>
                <td className="text-white/50">{m.branch?.name ?? "—"}</td>
                <td>{planLabel(m.plan)}</td>
                <td>{formatDate(m.expiry_date)}</td>
                <td>
                  <StatusBadge status={m.status} />
                </td>
                <td className="text-white/50">{m.member_batches.map((mb: any) => mb.batch?.name).filter(Boolean).join(", ") || "—"}</td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-white/40 py-8">
                  No members match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />

      {showAdd && (
        <AddMemberModal
          batches={batches ?? []}
          branches={branches ?? []}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            queryClient.invalidateQueries({ queryKey: ["admin-members"] });
          }}
        />
      )}

      {showSheetSettings && <SheetSyncSettingsModal onClose={() => setShowSheetSettings(false)} />}
    </div>
  );
}

function SheetSyncSettingsModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [nextPersonNo, setNextPersonNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useState(() => {
    supabase
      .from("sheet_sync_settings")
      .select("*")
      .eq("id", "singleton")
      .single()
      .then(({ data }) => {
        if (data) {
          setUrl(data.apps_script_url ?? "");
          setToken(data.apps_script_token ?? "");
          setNextPersonNo(data.next_person_no);
        }
        setLoading(false);
      });
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("sheet_sync_settings")
        .update({ apps_script_url: url.trim() || null, apps_script_token: token.trim() || null, next_person_no: nextPersonNo })
        .eq("id", "singleton");
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Spreadsheet Sync" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-white/40">
            Adding or renewing a member appends one row to your Google Sheet (ID, Name, Phone, Start/End date,
            Status, Membership months). Other columns — fees, collection status, training type, revenue — stay
            manual. Requires a small Apps Script deployed on your sheet; ask me for the setup steps if you haven't
            done that yet.
          </p>
          <div>
            <label className="label">Apps Script Web App URL</label>
            <input
              className="input"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Shared Token</label>
            <input
              className="input"
              placeholder="Must match SECRET_TOKEN in the Apps Script"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Next Person Number</label>
            <input
              type="number"
              min={1}
              className="input"
              value={nextPersonNo}
              onChange={(e) => setNextPersonNo(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-white/30">
              The SNo the next new member will get in the sheet. Set this to continue after your sheet's current
              highest SNo.
            </p>
          </div>
          {error && <p className="text-sm text-status-expired">{error}</p>}
          {saved && <p className="text-sm text-accent-green">Saved.</p>}
          <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function AddMemberModal({
  batches,
  branches,
  onClose,
  onCreated,
}: {
  batches: Batch[];
  branches: Branch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<MembershipPlan>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDateOverride, setEndDateOverride] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [trainingType, setTrainingType] = useState<"group" | "pt">("group");
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [ptTrainerId, setPtTrainerId] = useState("");
  const [ptTrainerShare, setPtTrainerShare] = useState("");
  const [totalFee, setTotalFee] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<"paid" | "partial" | "unpaid">("paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [caliPercent, setCaliPercent] = useState("100");
  const [invoiceShared, setInvoiceShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetWarning, setSheetWarning] = useState<string | null>(null);

  const batchesInBranch = batches.filter((b) => b.status === "active" && b.branch_id === branchId);

  const { data: trainersInBranch } = useQuery({
    queryKey: ["trainers-in-branch", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_branches")
        .select("trainer:profiles(id, full_name)")
        .eq("branch_id", branchId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.trainer).filter(Boolean) as { id: string; full_name: string }[];
    },
  });

  async function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    if (!branchId) {
      setError("Branch is required.");
      return;
    }
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
    setError(null);
    try {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({
          name,
          phone,
          email: email.trim() || null,
          plan,
          start_date: startDate,
          branch_id: branchId,
          total_fee: totalFeeValue,
          cali_percent: caliPercent.trim() ? Number(caliPercent) : null,
          invoice_shared: invoiceShared,
        })
        .select()
        .single();
      if (memberError) throw memberError;

      if (paidAmount > 0) {
        const { error: paymentError } = await supabase
          .from("payments")
          .insert({ member_id: member.id, amount: paidAmount, paid_date: todayISO() });
        if (paymentError) throw paymentError;
      }

      // The plan+start_date trigger sets a default expiry — override it if
      // the admin gave a specific end date (e.g. a split/paused membership).
      if (endDateOverride) {
        const { error: expiryError } = await supabase
          .from("members")
          .update({ expiry_date: endDateOverride })
          .eq("id", member.id);
        if (expiryError) throw expiryError;
        member.expiry_date = endDateOverride;
      }

      if (selectedBatches.size > 0) {
        const rows = Array.from(selectedBatches).map((batch_id) => ({ member_id: member.id, batch_id }));
        const { error: batchError } = await supabase.from("member_batches").insert(rows);
        if (batchError) throw batchError;
      }

      if (ptTrainerId) {
        const { error: ptError } = await supabase
          .from("pt_clients")
          .insert({ member_id: member.id, trainer_id: ptTrainerId, trainer_share_percent: shareValue });
        if (ptError) throw ptError;
      }

      const sync = await syncMemberToSheet(member, false);
      if (!sync.ok) {
        setSheetWarning(sync.error);
        setSaving(false);
        return;
      }

      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create member.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Member" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">Email (optional)</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Branch</label>
          <select
            className="input"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setSelectedBatches(new Set());
              setPtTrainerId("");
              setPtTrainerShare("");
            }}
          >
            {branches.length === 0 && <option value="">No branches yet</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Plan</label>
            <select className="input" value={plan} onChange={(e) => setPlan(e.target.value as MembershipPlan)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half-Yearly</option>
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">End Date (optional override)</label>
          <input
            type="date"
            className="input"
            value={endDateOverride}
            onChange={(e) => setEndDateOverride(e.target.value)}
          />
          <p className="mt-1 text-xs text-white/30">
            Leave blank to auto-calculate from plan + start date. Set this if the membership is split across
            different months and doesn't match the usual duration.
          </p>
        </div>
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
                  className={clsx(
                    "rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors",
                    paymentChoice === choice
                      ? "border-accent-green bg-accent-green/10 text-accent-green"
                      : "border-base-600 text-white/50 hover:text-white"
                  )}
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Cali % (revenue share)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className="input"
              value={caliPercent}
              onChange={(e) => setCaliPercent(e.target.value)}
            />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={invoiceShared}
                onChange={(e) => setInvoiceShared(e.target.checked)}
                className="h-5 w-5 rounded border-2 border-base-500 accent-accent-green"
              />
              Invoice Shared
            </label>
          </div>
        </div>
        <div>
          <label className="label">Training Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={clsx(
                "rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
                trainingType === "group"
                  ? "border-accent-green bg-accent-green/10 text-accent-green"
                  : "border-base-600 text-white/50 hover:text-white"
              )}
              onClick={() => {
                setTrainingType("group");
                setPtTrainerId("");
                setPtTrainerShare("");
              }}
            >
              Group (batch)
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
                trainingType === "pt"
                  ? "border-accent-green bg-accent-green/10 text-accent-green"
                  : "border-base-600 text-white/50 hover:text-white"
              )}
              onClick={() => {
                setTrainingType("pt");
                setSelectedBatches(new Set());
              }}
            >
              Personal Training
            </button>
          </div>
        </div>

        {trainingType === "group" ? (
          <div>
            <label className="label">Assign Batch</label>
            <select
              className="input"
              value={selectedBatches.size > 0 ? Array.from(selectedBatches)[0] : ""}
              onChange={(e) => setSelectedBatches(e.target.value ? new Set([e.target.value]) : new Set())}
            >
              <option value="">— None —</option>
              {batchesInBranch.map((b) => (
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
              {(trainersInBranch ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-white/30">PT has no fixed time slot — the member trains 1:1 with this trainer.</p>
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
              Member added, but couldn't sync to the spreadsheet: {sheetWarning}
            </p>
            <button className="btn-primary w-full" onClick={onCreated}>
              Continue
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving || !branchId}>
            {saving ? "Saving…" : "Add Member"}
          </button>
        )}
      </div>
    </Modal>
  );
}
