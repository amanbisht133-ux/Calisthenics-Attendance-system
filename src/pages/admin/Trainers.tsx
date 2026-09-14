import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import type { Member } from "@/lib/database.types";

export function Trainers() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [ptTrainer, setPtTrainer] = useState<any | null>(null);

  const { data: trainers, isLoading } = useQuery({
    queryKey: ["admin-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, trainer_batches(batch:batches(id, name)), pt_clients(id, member:members(name))")
        .eq("role", "trainer")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trainers</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Trainer
        </button>
      </div>

      {isLoading && <p className="text-white/50">Loading trainers…</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(trainers ?? []).map((t) => (
          <div key={t.id} className="card p-4">
            <h3 className="font-bold">{t.full_name}</h3>
            <p className="text-sm text-white/50">{t.email}</p>
            <p className="mt-2 text-xs text-white/40">
              {t.trainer_batches.length} batch{t.trainer_batches.length === 1 ? "" : "es"} · {t.pt_clients.length} PT client
              {t.pt_clients.length === 1 ? "" : "s"}
            </p>
            <div className="mt-1 text-xs text-white/60">
              {t.trainer_batches.map((tb: any) => tb.batch?.name).join(", ") || "No batches assigned"}
            </div>
            <button className="btn-secondary mt-3 w-full !py-2 text-xs" onClick={() => setPtTrainer(t)}>
              Manage PT Clients
            </button>
          </div>
        ))}
        {!isLoading && (trainers ?? []).length === 0 && (
          <p className="text-white/40 sm:col-span-3">No trainers yet. Add one to get started.</p>
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

      {ptTrainer && (
        <ManagePTModal
          trainer={ptTrainer}
          onClose={() => setPtTrainer(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["admin-trainers"] })}
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

function ManagePTModal({ trainer, onClose, onChanged }: { trainer: any; onClose: () => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: members } = useQuery({
    queryKey: ["all-members-simple"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const assignedMemberIds = new Set<string>();

  const { data: ptRows } = useQuery({
    queryKey: ["pt-clients-of", trainer.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pt_clients").select("*").eq("trainer_id", trainer.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  (ptRows ?? []).forEach((r: any) => assignedMemberIds.add(r.member_id));

  async function toggle(memberId: string) {
    if (assignedMemberIds.has(memberId)) {
      await supabase.from("pt_clients").delete().eq("trainer_id", trainer.id).eq("member_id", memberId);
    } else {
      await supabase.from("pt_clients").insert({ trainer_id: trainer.id, member_id: memberId });
    }
    queryClient.invalidateQueries({ queryKey: ["pt-clients-of", trainer.id] });
    onChanged();
  }

  const filtered = (members ?? []).filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal title={`PT Clients — ${trainer.full_name}`} onClose={onClose} wide>
      <div className="space-y-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search members…" />
        <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-base-600 p-2">
          {filtered.map((m) => {
            const assigned = assignedMemberIds.has(m.id);
            return (
              <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-base-700">
                <input type="checkbox" checked={assigned} onChange={() => toggle(m.id)} />
                {m.name} <span className="text-white/30">· {m.phone}</span>
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
