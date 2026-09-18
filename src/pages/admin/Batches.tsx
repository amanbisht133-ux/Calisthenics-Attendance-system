import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import type { Batch, BatchCategory, BatchStatus, Branch } from "@/lib/database.types";

const CATEGORY_LABELS: Record<BatchCategory, string> = {
  weekday_morning: "Weekday Morning",
  kids: "Kids Batch",
  weekday_evening: "Weekday Evening",
  weekend: "Weekend Batch",
  personal_training: "Personal Training",
};

export function Batches() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [manageBatch, setManageBatch] = useState<Batch | null>(null);
  const [deleteBatch, setDeleteBatch] = useState<any | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const { data: batches, isLoading } = useQuery({
    queryKey: ["all-batches-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*, branch:branches(id, name), member_batches(member_id)")
        .order("category")
        .order("time_slot");
      if (error) throw error;
      return (data ?? []) as any[];
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

  const filteredBatches = (batches ?? []).filter((b) => branchFilter === "all" || b.branch_id === branchFilter);

  const grouped = filteredBatches.reduce<Record<string, any[]>>((acc, b) => {
    (acc[b.category] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Batches</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Batch
        </button>
      </div>

      <select className="input sm:max-w-xs" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
        <option value="all">All Branches</option>
        {(branches ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {isLoading && <p className="text-white/50">Loading batches…</p>}

      {Object.entries(grouped).map(([category, list]) => (
        <div key={category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/40">
            {CATEGORY_LABELS[category as BatchCategory]}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{b.name}</h3>
                    <p className="text-sm text-white/50">
                      {b.time_slot} · {b.days}
                    </p>
                    <p className="text-xs text-accent-green">{b.branch?.name}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      b.status === "active" ? "bg-accent-green/15 text-accent-green" : "bg-white/10 text-white/50"
                    }`}
                  >
                    {b.status === "active" ? "Active" : "Upcoming"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-white/40">
                  {b.member_batches.length} member{b.member_batches.length === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary flex-1 !py-2 text-xs" onClick={() => setManageBatch(b)}>
                    Manage
                  </button>
                  <button
                    className="btn-ghost !py-2 text-xs text-status-expired"
                    onClick={() => setDeleteBatch(b)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddBatchModal
          branches={branches ?? []}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            queryClient.invalidateQueries({ queryKey: ["all-batches-full"] });
          }}
        />
      )}

      {manageBatch && (
        <ManageBatchModal
          batch={manageBatch}
          branches={branches ?? []}
          onClose={() => setManageBatch(null)}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ["all-batches-full"] });
          }}
        />
      )}

      {deleteBatch && (
        <DeleteBatchModal
          batch={deleteBatch}
          onClose={() => setDeleteBatch(null)}
          onDeleted={() => {
            setDeleteBatch(null);
            queryClient.invalidateQueries({ queryKey: ["all-batches-full"] });
          }}
        />
      )}
    </div>
  );
}

function AddBatchModal({
  branches,
  onClose,
  onCreated,
}: {
  branches: Branch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BatchCategory>("weekday_morning");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [timeSlot, setTimeSlot] = useState("");
  const [days, setDays] = useState("Mon-Fri");
  const [status, setStatus] = useState<BatchStatus>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !timeSlot.trim()) {
      setError("Name and time slot are required.");
      return;
    }
    if (!branchId) {
      setError("Branch is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("batches")
        .insert({ name, category, time_slot: timeSlot, days, status, branch_id: branchId });
      if (error) throw error;
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Batch" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Batch Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.length === 0 && <option value="">No branches yet</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as BatchCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Time Slot</label>
            <input className="input" placeholder="6:30 - 7:30 AM" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} />
          </div>
          <div>
            <label className="label">Days</label>
            <input className="input" placeholder="Mon-Fri" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming (not yet launched)</option>
          </select>
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving || !branchId}>
          {saving ? "Saving…" : "Add Batch"}
        </button>
      </div>
    </Modal>
  );
}

function ManageBatchModal({
  batch,
  branches,
  onClose,
  onChanged,
}: {
  batch: any;
  branches: Branch[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<BatchStatus>(batch.status);
  const [branchId, setBranchId] = useState<string>(batch.branch_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveChanges() {
    if (!branchId) {
      setError("Branch is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("batches").update({ status, branch_id: branchId }).eq("id", batch.id);
      if (error) throw error;
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Manage — ${batch.name}`} onClose={onClose}>
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
          {branchId !== batch.branch_id && (
            <p className="mt-1 text-xs text-yellow-500/70">
              Moving this batch to a different branch — trainers only work with batches in their own branch.
            </p>
          )}
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming (not yet launched)</option>
          </select>
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={saveChanges} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteBatchModal({ batch, onClose, onDeleted }: { batch: any; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: attendanceCount, isLoading } = useQuery({
    queryKey: ["batch-attendance-count", batch.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batch.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const blocked = !isLoading && (attendanceCount ?? 0) > 0;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { error } = await supabase.from("batches").delete().eq("id", batch.id);
      if (error) throw error;
      onDeleted();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete batch.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={`Delete — ${batch.name}`} onClose={onClose}>
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-white/50">Checking attendance history…</p>
        ) : blocked ? (
          <p className="text-sm text-white/70">
            This batch has {attendanceCount} attendance session{attendanceCount === 1 ? "" : "s"} recorded against
            it, so it can't be deleted — that would break the audit trail. Set its status to "Upcoming" instead if
            you want to retire it, or reach out if you specifically need old records purged.
          </p>
        ) : (
          <p className="text-sm text-white/70">
            This will permanently delete "{batch.name}" and unassign it from any members. This can't be undone.
          </p>
        )}
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button
          className="btn-primary w-full !bg-status-expired disabled:opacity-40"
          onClick={handleDelete}
          disabled={deleting || isLoading || blocked}
        >
          {deleting ? "Deleting…" : "Delete Batch"}
        </button>
      </div>
    </Modal>
  );
}
