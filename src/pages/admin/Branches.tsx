import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import type { Profile } from "@/lib/database.types";

export function Branches() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [manageBranch, setManageBranch] = useState<any | null>(null);
  const [deleteBranch, setDeleteBranch] = useState<any | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["all-branches-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*, trainer_branches(trainer:profiles(id, full_name)), batches(id), members(id)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["all-branches-full"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Branches</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Branch
        </button>
      </div>

      {isLoading && <p className="text-white/50">Loading branches…</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(branches ?? []).map((b) => (
          <div key={b.id} className="card p-4">
            <h3 className="font-bold">{b.name}</h3>
            <p className="mt-2 text-xs text-white/40">
              {b.members.length} member{b.members.length === 1 ? "" : "s"} · {b.batches.length} batch
              {b.batches.length === 1 ? "" : "es"}
            </p>
            <div className="mt-1 text-xs text-white/60">
              {b.trainer_branches.map((tb: any) => tb.trainer?.full_name).join(", ") || "No trainer assigned"}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary flex-1 !py-2 text-xs" onClick={() => setManageBranch(b)}>
                Manage
              </button>
              <button
                className="btn-ghost !py-2 text-xs text-status-expired"
                onClick={() => setDeleteBranch(b)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && (branches ?? []).length === 0 && (
          <p className="text-white/40 sm:col-span-3">No branches yet. Add one to get started.</p>
        )}
      </div>

      {showAdd && (
        <AddBranchModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {manageBranch && (
        <ManageBranchModal branch={manageBranch} onClose={() => setManageBranch(null)} onChanged={refresh} />
      )}

      {deleteBranch && (
        <DeleteBranchModal
          branch={deleteBranch}
          onClose={() => setDeleteBranch(null)}
          onDeleted={() => {
            setDeleteBranch(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddBranchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Branch name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("branches").insert({ name });
      if (error) throw error;
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create branch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Branch" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Branch Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Add Branch"}
        </button>
      </div>
    </Modal>
  );
}

function ManageBranchModal({ branch, onClose, onChanged }: { branch: any; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(branch.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: trainers } = useQuery({
    queryKey: ["all-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("role", "trainer").order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const assignedIds = new Set(branch.trainer_branches.map((tb: any) => tb.trainer?.id));

  async function toggleTrainer(trainerId: string, assigned: boolean) {
    if (assigned) {
      await supabase.from("trainer_branches").delete().eq("trainer_id", trainerId).eq("branch_id", branch.id);
    } else {
      await supabase.from("trainer_branches").insert({ trainer_id: trainerId, branch_id: branch.id });
    }
    onChanged();
  }

  async function saveName() {
    if (!name.trim()) {
      setError("Branch name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("branches").update({ name }).eq("id", branch.id);
      if (error) throw error;
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Manage — ${branch.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Branch Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={saveName} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteBranchModal({ branch, onClose, onDeleted }: { branch: any; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = branch.members.length > 0 || branch.batches.length > 0;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { error } = await supabase.from("branches").delete().eq("id", branch.id);
      if (error) throw error;
      onDeleted();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete branch.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={`Delete — ${branch.name}`} onClose={onClose}>
      <div className="space-y-4">
        {blocked ? (
          <p className="text-sm text-white/70">
            This branch still has {branch.members.length} member{branch.members.length === 1 ? "" : "s"} and{" "}
            {branch.batches.length} batch{branch.batches.length === 1 ? "" : "es"} assigned to it. Move or delete
            those first, then come back to delete the branch.
          </p>
        ) : (
          <p className="text-sm text-white/70">This will permanently delete "{branch.name}". This can't be undone.</p>
        )}
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button
          className="btn-primary w-full !bg-status-expired disabled:opacity-40"
          onClick={handleDelete}
          disabled={deleting || blocked}
        >
          {deleting ? "Deleting…" : "Delete Branch"}
        </button>
      </div>
    </Modal>
  );
}
