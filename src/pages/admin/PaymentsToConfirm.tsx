import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { d, fetchQueue, inr, rpc, thankYouMessage, waLink, type RenewalDue } from "@/lib/renewals";
import { DueHeader, Section, WaButton, useAcademyPicker } from "@/components/renewals/RenewalBits";

/**
 * Members who tapped "I've paid" on their pay page, or whom a trainer marked
 * as paid at the desk. Confirm = payment recorded, package dates extended
 * (renewals), then a one-tap thank-you on WhatsApp. Claude writes the entry
 * into the academy's tracker in its existing format.
 */
export function PaymentsToConfirm() {
  const { academy, tabs } = useAcademyPicker();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["renewal-queue", academy?.branch_id],
    queryFn: () => fetchQueue(academy!.branch_id),
    enabled: !!academy,
    refetchInterval: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["renewal-queue"] });
  const pending = rows.filter((r) => r.stage === "confirm");
  const toThank = rows.filter((r) => r.status === "confirmed" && !r.thanked_at);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl">Payments to confirm</h1>
          <p className="text-sm text-white/50">Check the money arrived (bank/UPI app or cash), then tap Confirm.</p>
        </div>
        {tabs}
      </div>

      {isLoading && <p className="text-white/50">Loading…</p>}
      {!isLoading && pending.length === 0 && toThank.length === 0 && (
        <div className="card p-6 text-center text-white/50">Nothing to confirm for {academy?.academy_name}.</div>
      )}

      <Section title="To confirm" count={pending.length} tone="text-accent-green">
        {pending.map((r) => (
          <ConfirmCard key={r.id} due={r} onChange={refresh} />
        ))}
      </Section>

      <Section title="Say thank you" hint="Confirmed" count={toThank.length} tone="text-status-active">
        {toThank.map((r) => (
          <div key={r.id} className="card space-y-3 p-4">
            <DueHeader due={r} right={<div className="mt-1 text-xs text-status-active">Confirmed ✓</div>} />
            <WaButton
              href={waLink(r.phone, thankYouMessage(r))}
              label="Send thank-you"
              onTap={() => {
                rpc("mark_thanked", { p_due_id: r.id }).then(refresh).catch(() => undefined);
              }}
            />
            {!r.tracker_logged_at && <p className="text-[11px] text-white/40">Tracker entry: Claude logs it on the next sync.</p>}
          </div>
        ))}
      </Section>
    </div>
  );
}

function ConfirmCard({ due, onChange }: { due: RenewalDue; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const source =
    due.status === "desk_paid"
      ? `Paid at desk · ${due.desk_method === "cash" ? "Cash" : "UPI"} · ${d(due.desk_marked_at, false)}`
      : `Member tapped "I've paid" · ${d(due.claimed_at, false)}`;
  async function run(fn: string) {
    setBusy(true);
    setErr(null);
    try {
      await rpc(fn, { p_due_id: due.id });
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
      <div className="rounded-xl bg-base-700/60 p-3 text-xs leading-relaxed text-white/65">
        <div>{source}</div>
        <div>
          Package {inr(due.package_fee)} · {d(due.package_start)} – {d(due.package_end)} · paid so far {inr(due.paid_so_far)}
        </div>
        {due.due_kind !== "installment" && due.renewal_start && (
          <div className="text-white/85">
            Confirm extends to {d(due.renewal_start)} – {d(due.renewal_end)}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !py-3" disabled={busy} onClick={() => run("confirm_due_payment")}>
          Confirm {inr(due.amount_due)}
        </button>
        <button className="btn-ghost !py-3 text-xs" disabled={busy} onClick={() => run("reject_due_claim")}>
          Not received
        </button>
      </div>
      {err && <p className="text-xs text-status-expired">{err}</p>}
    </div>
  );
}
