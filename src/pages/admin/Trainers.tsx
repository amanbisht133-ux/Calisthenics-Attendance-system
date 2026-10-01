import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import type { Branch } from "@/lib/database.types";

export function Trainers() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [editTrainer, setEditTrainer] = useState<any | null>(null);
  const [deleteTrainer, setDeleteTrainer] = useState<any | null>(null);

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

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-trainers"] });
  }

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
          <div key={t.id} className={`card p-4 ${t.is_active === false ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold">{t.full_name}</h3>
              {t.is_active === false && (
                <span className="shrink-0 rounded-full bg-status-expired/15 px-2 py-0.5 text-[10px] font-bold uppercase text-status-expired">
                  Inactive
                </span>
              )}
            </div>
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
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => setEditTrainer(t)}>
                Edit
              </button>
              <button
                className="btn-ghost flex-1 !py-1.5 text-xs text-status-expired hover:bg-status-expired/10"
                onClick={() => setDeleteTrainer(t)}
              >
                Delete
              </button>
            </div>
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
            refresh();
          }}
        />
      )}

      {editTrainer && (
        <EditTrainerModal
          trainer={editTrainer}
          onClose={() => setEditTrainer(null)}
          onSaved={() => {
            setEditTrainer(null);
            refresh();
          }}
        />
      )}

      {deleteTrainer && (
        <DeleteTrainerModal
          trainer={deleteTrainer}
          onClose={() => setDeleteTrainer(null)}
          onDeleted={() => {
            setDeleteTrainer(null);
            refresh();
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
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError("Full name, email and a password (6+ chars) are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-trainer", {
        body: { full_name: fullName, email, phone, password },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error, "Failed to create trainer."));
      if (data?.emailError) {
        setEmailWarning(`Trainer created, but the welcome email couldn't be sent: ${data.emailError}`);
        setSaving(false);
        return;
      }
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
        <p className="text-xs text-white/30">The trainer's email and password above will be emailed to them automatically.</p>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        {emailWarning ? (
          <>
            <p className="text-sm text-accent-orange">{emailWarning}</p>
            <button className="btn-primary w-full" onClick={onCreated}>
              Continue
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create Trainer Account"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function EditTrainerModal({
  trainer,
  onClose,
  onSaved,
}: {
  trainer: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(trainer.full_name ?? "");
  const [email, setEmail] = useState(trainer.email ?? "");
  const [phone, setPhone] = useState(trainer.phone ?? "");
  const [resetPassword, setResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim()) {
      setError("Full name and email are required.");
      return;
    }
    if (resetPassword && newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("update-trainer", {
        body: {
          trainer_id: trainer.id,
          full_name: fullName,
          phone,
          email,
          new_password: resetPassword ? newPassword : undefined,
        },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error, "Failed to update trainer."));
      if (data?.emailError) {
        setEmailWarning(`Saved, but the credentials email couldn't be sent: ${data.emailError}`);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to update trainer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit — ${trainer.full_name}`} onClose={onClose}>
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

        <div className="border-t border-base-600 pt-4">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={resetPassword}
              onChange={(e) => {
                setResetPassword(e.target.checked);
                setNewPassword("");
              }}
              className="h-5 w-5 rounded border-2 border-base-500 accent-accent-green"
            />
            Reset password
          </label>
          {resetPassword && (
            <div className="mt-2">
              <input
                className="input"
                type="text"
                placeholder="New password (6+ chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-white/30">
                This new password will be emailed to the trainer at the address above.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-status-expired">{error}</p>}
        {emailWarning ? (
          <>
            <p className="text-sm text-accent-orange">{emailWarning}</p>
            <button className="btn-primary w-full" onClick={onSaved}>
              Continue
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function DeleteTrainerModal({
  trainer,
  onClose,
  onDeleted,
}: {
  trainer: any;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deleted: boolean; deactivated: boolean } | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("delete-trainer", {
        body: { trainer_id: trainer.id },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error, "Failed to delete trainer."));
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to delete trainer.");
    } finally {
      setDeleting(false);
    }
  }

  if (result) {
    return (
      <Modal title="Trainer Removed" onClose={onDeleted}>
        <div className="space-y-4">
          {result.deleted ? (
            <p className="text-sm text-white/70">{trainer.full_name}'s account has been permanently deleted.</p>
          ) : (
            <p className="text-sm text-white/70">
              {trainer.full_name} has attendance or PT session history on record, so the account was{" "}
              <strong>deactivated</strong> instead of deleted — their login is disabled and they're hidden from new
              assignments, but their historical records stay intact.
            </p>
          )}
          <button className="btn-primary w-full" onClick={onDeleted}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Delete — ${trainer.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-white/70">
          This will permanently delete {trainer.full_name}'s login. If they have no attendance or PT session history,
          their account is removed entirely. If they do have history, the account will be deactivated instead (login
          disabled, hidden from new assignments) so existing records aren't lost.
        </p>
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
