import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import type { Batch, BatchCategory, BatchStatus, Profile } from "@/lib/database.types";

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

  const { data: batches, isLoading } = useQuery({
    queryKey: ["all-batches-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*, trainer_batches(trainer:profiles(id, full_name)), member_batches(member_id)")
        .order("category")
        .order("time_slot");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const grouped = (batches ?? []).reduce<Record<string, any[]>>((acc, b) => {
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
                  {b.trainer_batches.length} trainer{b.trainer_batches.length === 1 ? "" : "s"} ·{" "}
                  {b.member_batches.length} member{b.member_batches.length === 1 ? "" : "s"}
                </p>
                <div className="mt-1 text-xs text-white/60">
                  {b.trainer_batches.map((tb: any) => tb.trainer?.full_name).join(", ") || "No trainer assigned"}
                </div>
                <button className="btn-secondary mt-3 w-full !py-2 text-xs" onClick={() => setManageBatch(b)}>
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddBatchModal
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
          onClose={() => setManageBatch(null)}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ["all-batches-full"] });
          }}
        />
      )}
    </div>
  );
}

function AddBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BatchCategory>("weekday_morning");
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
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("batches").insert({ name, category, time_slot: timeSlot, days, status });
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
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Add Batch"}
        </button>
      </div>
    </Modal>
  );
}

function ManageBatchModal({ batch, onClose, onChanged }: { batch: any; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<BatchStatus>(batch.status);
  const [saving, setSaving] = useState(false);

  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const assignedIds = new Set(batch.trainer_batches.map((tb: any) => tb.trainer?.id));

  async function toggleTrainer(trainerId: string, assigned: boolean) {
    if (assigned) {
      await supabase.from("trainer_batches").delete().eq("trainer_id", trainerId).eq("batch_id", batch.id);
    } else {
      await supabase.from("trainer_batches").insert({ trainer_id: trainerId, batch_id: batch.id });
    }
    onChanged();
  }

  async function updateStatus() {
    setSaving(true);
    await supabase.from("batches").update({ status }).eq("id", batch.id);
    setSaving(false);
    onChanged();
    onClose();
  }

  return (
    <Modal title={`Manage — ${batch.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming (not yet launched)</option>
          </select>
        </div>
        <div>
          <label className="label">Assigned Trainers</label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-base-600 p-2">
            {(trainers ?? []).map((t) => {
              const assigned = assignedIds.has(t.id);
              return (
                <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-base-700">
                  <input type="checkbox" checked={assigned} onChange={() => toggleTrainer(t.id, assigned)} />
                  {t.full_name}
                </label>
              );
            })}
            {(trainers ?? []).length === 0 && <p className="px-2 py-2 text-sm text-white/40">No trainers yet.</p>}
          </div>
        </div>
        <button className="btn-primary w-full" onClick={updateStatus} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}
