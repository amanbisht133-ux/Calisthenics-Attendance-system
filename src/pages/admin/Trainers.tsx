import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import type { Branch } from "@/lib/database.types";

const STAFF_DOMAIN = "@staff.calisthenicshq.app";
const activePT = (t: any) => (t.pt_clients ?? []).filter((c: any) => !c.member?.expiry_date || c.member.expiry_date >= new Date().toLocaleDateString("en-CA")).length;
const loginOf = (email?: string | null) => (email ?? "").replace(STAFF_DOMAIN, "");

export function Trainers() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [addRole, setAddRole] = useState<"trainer" | "admin" | null>(null);
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

  const { data: people, isLoading } = useQuery({
    queryKey: ["admin-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, trainer_branches(branch:branches(id, name)), pt_clients(id, member:members(name, expiry_date))")
        .in("role", ["trainer", "admin"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const admins = (people ?? []).filter((p) => p.role === "admin");
  const filteredTrainers = (people ?? [])
    .filter((p) => p.role === "trainer")
    .filter((t) => branchFilter === "all" || t.trainer_branches.some((tb: any) => tb.branch?.id === branchFilter));

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-trainers"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl leading-none">Team</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setAddRole("admin")}>
            + Add Admin
          </button>
          <button className="btn-primary" onClick={() => setAddRole("trainer")}>
            + Add Trainer
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Admins</h2>
        <div className="card divide-y divide-white/5">
          {admins.map((a) => (
            <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.is_active === false ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {a.full_name}
                  {a.id === profile?.id && <span className="ml-2 text-xs text-white/40">(you)</span>}
                </div>
                <div className="truncate text-xs text-white/50">Login: {loginOf(a.email)}</div>
              </div>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => setEditTrainer(a)}>
                Edit
              </button>
              {a.id !== profile?.id && (
                <button
                  className="btn-ghost !py-1.5 text-xs text-status-expired hover:bg-status-expired/10"
                  onClick={() => setDeleteTrainer(a)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Trainers</h2>
          <select className="input !w-auto" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All academies</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <p className="text-white/50">Loading…</p>}

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
              <p className="text-sm text-white/50">Login: {loginOf(t.email)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.trainer_branches.length === 0 && <span className="text-xs text-status-expired">No academy assigned</span>}
                {t.trainer_branches.map((tb: any) => (
                  <span key={tb.branch?.id} className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70">
                    {tb.branch?.name}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-white/40">
                {activePT(t)} active PT client{activePT(t) === 1 ? "" : "s"}
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
            <p className="text-white/40 sm:col-span-3">No trainers here yet.</p>
          )}
        </div>
      </section>

      {addRole && (
        <AddMemberModal
          role={addRole}
          branches={branches ?? []}
          onClose={() => setAddRole(null)}
          onDone={() => {
            setAddRole(null);
            refresh();
          }}
        />
      )}

      {editTrainer && (
        <EditMemberModal
          person={editTrainer}
          branches={branches ?? []}
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

function AcademyPicker({
  branches,
  selected,
  onChange,
}: {
  branches: Branch[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <label className="label">Academies</label>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const on = selected.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== b.id) : [...selected, b.id])}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                on ? "border-accent-green bg-accent-green/15 text-accent-green" : "border-white/15 text-white/60"
              }`}
            >
              {on ? "✓ " : ""}
              {b.name}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-white/30">Pick one or both. The trainer only sees batches of these academies.</p>
    </div>
  );
}

function AddMemberModal({
  role,
  branches,
  onClose,
  onDone,
}: {
  role: "trainer" | "admin";
  branches: Branch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const label = role === "admin" ? "Admin" : "Trainer";

  async function handleSubmit() {
    if (!fullName.trim() || !login.trim() || password.length < 6) {
      setError("Name, username and a password (6+ characters) are required.");
      return;
    }
    if (role === "trainer" && branchIds.length === 0) {
      setError("Pick at least one academy.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.functions.invoke("create-trainer", {
        body: { full_name: fullName, login, phone, password, role, branch_ids: role === "trainer" ? branchIds : [] },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error, `Failed to create ${label.toLowerCase()}.`));
      setCreated(true);
    } catch (e: any) {
      setError(e.message ?? `Failed to create ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Modal title={`${label} created`} onClose={onDone}>
        <div className="space-y-4">
          <p className="text-sm text-white/70">Share these login details with {fullName}. No email is sent.</p>
          <div className="card space-y-1 p-4 text-sm">
            <div>
              <span className="text-white/50">Username: </span>
              <strong>{login.trim().toLowerCase()}</strong>
            </div>
            <div>
              <span className="text-white/50">Password: </span>
              <strong>{password}</strong>
            </div>
          </div>
          <button className="btn-primary w-full" onClick={onDone}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Add ${label}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Username (what they type to log in)</label>
          <input
            className="input"
            autoCapitalize="none"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="e.g. shiva"
          />
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {role === "trainer" && <AcademyPicker branches={branches} selected={branchIds} onChange={setBranchIds} />}
        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Creating…" : `Create ${label} Account`}
        </button>
      </div>
    </Modal>
  );
}

function EditMemberModal({
  person,
  branches,
  onClose,
  onSaved,
}: {
  person: any;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isTrainer = person.role === "trainer";
  const initialBranchIds: string[] = (person.trainer_branches ?? []).map((tb: any) => tb.branch?.id).filter(Boolean);
  const [fullName, setFullName] = useState(person.full_name ?? "");
  const [login, setLogin] = useState(loginOf(person.email));
  const [phone, setPhone] = useState(person.phone ?? "");
  const [branchIds, setBranchIds] = useState<string[]>(initialBranchIds);
  const [resetPassword, setResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!fullName.trim()) {
      setError("Name is required.");
      return;
    }
    if (!login.trim()) {
      setError("Username can't be empty.");
      return;
    }
    if (resetPassword && newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.functions.invoke("update-trainer", {
        body: {
          trainer_id: person.id,
          full_name: fullName,
          phone,
          new_login: login.trim().toLowerCase() !== loginOf(person.email) ? login : undefined,
          new_password: resetPassword ? newPassword : undefined,
        },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error, "Failed to save."));

      if (isTrainer) {
        const toAdd = branchIds.filter((id) => !initialBranchIds.includes(id));
        const toRemove = initialBranchIds.filter((id) => !branchIds.includes(id));
        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from("trainer_branches")
            .delete()
            .eq("trainer_id", person.id)
            .in("branch_id", toRemove);
          if (delErr) throw delErr;
        }
        if (toAdd.length > 0) {
          const { error: insErr } = await supabase
            .from("trainer_branches")
            .insert(toAdd.map((branch_id) => ({ trainer_id: person.id, branch_id })));
          if (insErr) throw insErr;
        }
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit — ${person.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Username (what they type to log in)</label>
          <input className="input" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {isTrainer && <AcademyPicker branches={branches} selected={branchIds} onChange={setBranchIds} />}

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
              <p className="mt-1 text-xs text-white/30">Tell them the new password yourself. No email is sent.</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-status-expired">{error}</p>}
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
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
      if (error) throw new Error(await extractFunctionErrorMessage(error, "Failed to delete account."));
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to delete account.");
    } finally {
      setDeleting(false);
    }
  }

  if (result) {
    return (
      <Modal title="Account Removed" onClose={onDeleted}>
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
