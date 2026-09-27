import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import type { Branch } from "@/lib/database.types";

export function Trainers() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const { data: trainers, isLoading } = useQuery({
    queryKey: ["admin-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, trainer_branches(branch:branches(id, name)), pt_clients(id, member:members(name))")
        .eq("role", "trainer")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filteredTrainers = (trainers ?? []).filter(
    (t) => branchFilter === "all" || t.trainer_branches.some((tb: any) => tb.branch?.id === branchFilter)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Trainers</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Trainer
        </button>
      </div>

      <div className="max-w-xs">
        <label className="label">Branch</label>
        <select className="input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="all">All Branches</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-white/50">Loading trainers…</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTrainers.map((t) => (
          <div key={t.id} className="card p-4">
            <h3 className="font-bold">{t.full_name}</h3>
            <p className="text-sm text-white/50">{t.email}</p>
            <p className="mt-2 text-xs text-white/40">
              {t.trainer_branches.length} branch{t.trainer_branches.length === 1 ? "" : "es"} · {t.pt_clients.length} PT client
              {t.pt_clients.length === 1 ? "" : "s"}
            </p>
            <div className="mt-1 text-xs text-white/60">
              {t.trainer_branches.map((tb: any) => tb.branch?.name).join(", ") || "No branch assigned"}
            </div>
            <p className="mt-1 text-xs text-white/30">
              Manage branch assignment under Admin → Branches. PT clients are assigned from a member's profile in
              Admin → Members.
            </p>
          </div>
        ))}
        {!isLoading && filteredTrainers.length === 0 && (
          <p className="text-white/40 sm:col-span-3">
            {branchFilter === "all" ? "No trainers yet. Add one to get started." : "No trainers assigned to this branch."}
          </p>
        )}
      </div>

      {showAdd && (
        <AddTrainerModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            queryClient.invalidateQueries({ queryKey: ["admin-trainers"] });
          }}
        />
      )}
    </div>
  );
}

function AddTrainerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError("Full name, email and a password (6+ chars) are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.functions.invoke("create-trainer", {
        body: { full_name: fullName, email, phone, password },
      });
      if (error) throw error;
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create trainer. Make sure the create-trainer Edge Function is deployed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Trainer" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">Temporary Password</label>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Creating…" : "Create Trainer Account"}
        </button>
      </div>
    </Modal>
  );
}
