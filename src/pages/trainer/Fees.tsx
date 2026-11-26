import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBranch } from "@/context/BranchContext";
import { d, fetchQueue, rpc, type RenewalDue } from "@/lib/renewals";
import { DueHeader, Section } from "@/components/renewals/RenewalBits";

/**
 * Trainer view for the selected academy only:
 * - "Needs a personal nudge": WhatsApp reminders are done, talk to them in class.
 * - "Fees due": tap "Paid at desk" when they pay you; their reminders stop.
 */
export function Fees() {
  const { selectedBranchId } = useBranch();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["renewal-queue", selectedBranchId],
    queryFn: () => fetchQueue(selectedBranchId!),
    enabled: !!selectedBranchId,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["renewal-queue"] });
  const nudge = rows.filter((r) => r.stage === "needs_nudge");
  const due = rows.filter((r) => ["send_day0", "send_day3", "waiting", "promised"].includes(r.stage));
  const marked = rows.filter((r) => r.status === "desk_paid");

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl">Fees</h1>
        <p className="text-sm text-white/50">If someone pays you at the desk, mark it here so they stop getting reminders.</p>
      </div>
      {isLoading && <p className="text-white/50">Loading…</p>}
      {!isLoading && nudge.length + due.length + marked.length === 0 && <div className="card p-6 text-center text-white/50">No fees due right now.</div>}

      <Section title="Needs a personal nudge" count={nudge.length} tone="text-status-expired">
        {nudge.map((r) => (
          <TrainerCard key={r.id} due={r} note="Reminders done: have a friendly word in class" onChange={refresh} />
        ))}
      </Section>
      <Section title="Fees due" count={due.length} tone="text-accent-green">
        {due.map((r) => (
          <TrainerCard key={r.id} due={r} note={r.stage === "promised" ? `Promised ${d(r.promise_date, false)}` : undefined} onChange={refresh} />
        ))}
      </Section>
      <Section title="Marked paid at desk" hint="Waiting for Aman" count={marked.length} tone="text-status-active">
        {marked.map((r) => (
          <div key={r.id} className="card p-4">
            <DueHeader due={r} right={<div className="mt-1 text-xs text-status-active">{r.desk_method === "cash" ? "Cash" : "UPI"} ✓</div>} />
          </div>
        ))}
      </Section>
    </div>
  );
}

function TrainerCard({ due, note, onChange }: { due: RenewalDue; note?: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [promise, setPromise] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await rpc(fn, args);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card space-y-3 p-4">
      <DueHeader due={due} />
      {note && <p className="text-xs text-white/55">{note}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !py-3 text-sm" disabled={busy} onClick={() => run("mark_desk_paid", { p_due_id: due.id, p_method: "cash" })}>
          Paid · Cash
        </button>
        <button className="btn-primary flex-1 !py-3 text-sm" disabled={busy} onClick={() => run("mark_desk_paid", { p_due_id: due.id, p_method: "upi" })}>
          Paid · UPI
        </button>
      </div>
      <div className="flex gap-2">
        <input type="date" className="input !py-2 text-xs" value={promise} onChange={(e) => setPromise(e.target.value)} aria-label="Will pay on" />
        <button className="btn-secondary shrink-0 !px-3 !py-2 text-xs" disabled={busy || !promise} onClick={() => run("set_promise_date", { p_due_id: due.id, p_date: promise })}>
          Will pay on
        </button>
      </div>
      {err && <p className="text-xs text-status-expired">{err}</p>}
    </div>
  );
}
