import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { formatDate, memberStatus, planLabel, todayISO } from "@/lib/utils";
import type { Batch, MembershipPlan } from "@/lib/database.types";

export function Members() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, member_batches(batch:batches(id, name))")
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

  const filtered = (members ?? []).filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (planFilter !== "all" && m.plan !== planFilter) return false;
    if (batchFilter !== "all" && !m.member_batches.some((mb: any) => mb.batch?.id === batchFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-sm text-white/50">{members?.length ?? 0} total</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Member
        </button>
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
        <select className="input sm:col-span-4" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
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
              <th>Plan</th>
              <th>Expiry</th>
              <th>Status</th>
              <th>Batches</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="cursor-pointer hover:bg-base-700/50" onClick={() => navigate(`/admin/members/${m.id}`)}>
                <td className="font-semibold">{m.name}</td>
                <td>{m.phone}</td>
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
                <td colSpan={6} className="text-center text-white/40 py-8">
                  No members match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddMemberModal
          batches={batches ?? []}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            queryClient.invalidateQueries({ queryKey: ["admin-members"] });
          }}
        />
      )}
    </div>
  );
}

function AddMemberModal({
  batches,
  onClose,
  onCreated,
}: {
  batches: Batch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<MembershipPlan>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBatch(id: string) {
    setSelectedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name, phone, plan, start_date: startDate })
        .select()
        .single();
      if (memberError) throw memberError;

      if (selectedBatches.size > 0) {
        const rows = Array.from(selectedBatches).map((batch_id) => ({ member_id: member.id, batch_id }));
        const { error: batchError } = await supabase.from("member_batches").insert(rows);
        if (batchError) throw batchError;
      }

      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to create member.");
    } finally {
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
          <label className="label">Assign Batches</label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-base-600 p-2">
            {batches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-base-700">
                <input type="checkbox" checked={selectedBatches.has(b.id)} onChange={() => toggleBatch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-status-expired">{error}</p>}

        <button className="btn-primary w-full" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Add Member"}
        </button>
      </div>
    </Modal>
  );
}
