import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  d,
  fetchQueue,
  reminderMessage,
  repeatMessage,
  rpc,
  sb,
  waLink,
  weeklyReport,
  type RenewalDue,
} from "@/lib/renewals";
import { DueHeader, ReportTiles, Section, WaButton, useAcademyPicker } from "@/components/renewals/RenewalBits";

/**
 * Monday renewals list. One academy at a time. Each member gets a ready
 * message and a one-tap WhatsApp button; tapping it records the reminder so
 * the day-3 repeat and the "needs a personal nudge" hand-off happen on time.
 */
export function Renewals() {
  const { academy, tabs } = useAcademyPicker();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["renewal-queue", academy?.branch_id],
    queryFn: () => fetchQueue(academy!.branch_id),
    enabled: !!academy,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["renewal-queue"] });

  const by = (s: string) => rows.filter((r) => r.stage === s);
  const toConfirm = by("confirm");
  const report = weeklyReport(rows);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl">Renewals</h1>
          <p className="text-sm text-white/50">Tap a WhatsApp button to open the chat with the message ready. Reminders go once on day 0, once again on day 3, then stop.</p>
        </div>
        {tabs}
        {academy && <UpiSetting key={academy.code} code={academy.code} current={academy.upi_id} onSaved={() => qc.invalidateQueries({ queryKey: ["academy-settings"] })} />}
      </div>

      <ReportTiles report={report} />

      {toConfirm.length > 0 && (
        <Link to="/admin/payments-to-confirm" className="card flex items-center justify-between p-4 hover:border-accent-green/40">
          <div>
            <div className="font-semibold">Payments to confirm</div>
            <div className="text-xs text-white/50">Members said they paid, or a trainer took it at the desk</div>
          </div>
          <span className="rounded-full bg-accent-green px-3 py-1 font-display text-xl text-base-900">{toConfirm.length}</span>
        </Link>
      )}

      {isLoading && <p className="text-white/50">Loading…</p>}
      {!isLoading && rows.filter((r) => !["renewed", "closed"].includes(r.stage)).length === 0 && (
        <div className="card p-6 text-center text-white/50">Nobody is due right now. The Monday run fills this list from the tracker.</div>
      )}

      <Section title="Send today" hint="Day 0" count={by("send_day0").length} tone="text-accent-green">
        {by("send_day0").map((r) => (
          <DueRow key={r.id} due={r} which={1} onChange={refresh} />
        ))}
      </Section>

      <Section title="Gentle repeat" hint="Day 3, last reminder" count={by("send_day3").length} tone="text-accent-orange">
        {by("send_day3").map((r) => (
          <DueRow key={r.id} due={r} which={2} onChange={refresh} />
        ))}
      </Section>

      <Section title="Promised" hint="Paused till their date" count={by("promised").length} tone="text-sky-300">
        {by("promised").map((r) => (
          <QuietRow key={r.id} due={r} note={`Promised ${d(r.promise_date, false)}`} onChange={refresh} />
        ))}
      </Section>

      <Section title="Waiting" hint="Reminder sent" count={by("waiting").length} tone="text-white/70">
        {by("waiting").map((r) => (
          <QuietRow key={r.id} due={r} note={`Repeat on ${d(r.repeat_on, false)}`} onChange={refresh} />
        ))}
      </Section>

      <Section title="Needs a personal nudge" hint="On trainers' screen" count={by("needs_nudge").length} tone="text-status-expired">
        {by("needs_nudge").map((r) => (
          <QuietRow key={r.id} due={r} note={r.possibly_leaving ? "Possibly leaving" : "Reminders done"} onChange={refresh} />
        ))}
      </Section>

      {report.renewed.count > 0 && (
        <Section title="Renewed this week" count={report.renewed.count} tone="text-status-active">
          {report.renewed.rows.map((r) => (
            <div key={r.id} className="card p-4">
              <DueHeader due={r} right={<div className="mt-1 text-xs text-status-active">Paid ✓</div>} />
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function DueRow({ due, which, onChange }: { due: RenewalDue; which: 1 | 2; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const text = which === 1 ? reminderMessage(due) : repeatMessage(due);
  return (
    <div className="card space-y-3 p-4">
      <DueHeader due={due} right={<div className="mt-1 text-[11px] text-white/45">paid {Number(due.paid_so_far).toLocaleString("en-IN")}</div>} />
      <button className="text-left text-xs text-white/50 underline-offset-2 hover:underline" onClick={() => setOpen(!open)}>
        {open ? "Hide message" : "Show message"}
      </button>
      {open && <pre className="whitespace-pre-wrap rounded-xl bg-base-700/70 p-3 font-sans text-[13px] leading-relaxed text-white/85">{text}</pre>}
      <WaButton
        href={waLink(due.phone, text)}
        label={which === 1 ? "Send on WhatsApp" : "Send gentle repeat"}
        onTap={() => {
          rpc("mark_reminder_sent", { p_due_id: due.id, p_which: which }).then(onChange).catch(() => undefined);
        }}
      />
      <DueActions due={due} onChange={onChange} />
    </div>
  );
}

function QuietRow({ due, note, onChange }: { due: RenewalDue; note: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <DueHeader due={due} right={<div className="mt-1 text-[11px] text-white/50">{note}</div>} />
      </button>
      {open && (
        <div className="mt-3">
          <DueActions due={due} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/** Promise date, paid at desk, open pay page. Shared by admin rows. */
export function DueActions({ due, onChange }: { due: RenewalDue; onChange: () => void }) {
  const [promise, setPromise] = useState(due.promise_date ?? "");
  const [busy, setBusy] = useState(false);
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="date" className="input !py-2 text-xs" value={promise} onChange={(e) => setPromise(e.target.value)} aria-label="Promise date" />
        <button className="btn-secondary shrink-0 !px-3 !py-2 text-xs" disabled={busy || !promise} onClick={() => run("set_promise_date", { p_due_id: due.id, p_date: promise })}>
          Promised
        </button>
        {due.status === "promised" && (
          <button className="btn-ghost shrink-0 !px-2 !py-2 text-xs" disabled={busy} onClick={() => run("set_promise_date", { p_due_id: due.id, p_date: null })}>
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1 !py-2 text-xs" disabled={busy} onClick={() => run("mark_desk_paid", { p_due_id: due.id, p_method: "cash" })}>
          Paid at desk · Cash
        </button>
        <button className="btn-secondary flex-1 !py-2 text-xs" disabled={busy} onClick={() => run("mark_desk_paid", { p_due_id: due.id, p_method: "upi" })}>
          Paid at desk · UPI
        </button>
        <a className="btn-ghost !px-3 !py-2 text-xs" href={due.pay_url} target="_blank" rel="noreferrer">
          Page ↗
        </a>
      </div>
      {err && <p className="text-xs text-status-expired">{err}</p>}
    </div>
  );
}

function UpiSetting({ code, current, onSaved }: { code: string; current: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [err, setErr] = useState<string | null>(null);
  if (!editing) {
    return (
      <button className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3.5 py-2.5 text-left text-sm" onClick={() => setEditing(true)}>
        <span className="text-white/50">{code} UPI ID</span>
        <span className={current ? "font-semibold" : "font-semibold text-status-expiring"}>{current ?? "Add UPI ID →"}</span>
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <input className="input" placeholder="yourname@okhdfcbank" value={value} onChange={(e) => setValue(e.target.value.trim())} />
      <button
        className="btn-primary shrink-0"
        onClick={async () => {
          const ok = /^[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}$/.test(value);
          if (!ok) return setErr("That doesn't look like a UPI ID");
          const { error } = await sb.from("academy_settings").update({ upi_id: value }).eq("code", code);
          if (error) return setErr(error.message);
          setEditing(false);
          onSaved();
        }}
      >
        Save
      </button>
      {err && <p className="text-xs text-status-expired">{err}</p>}
    </div>
  );
}
