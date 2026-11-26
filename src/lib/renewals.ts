// Renewal Agent helpers: types, WhatsApp message text and links.
// CLI and ICS are always handled one academy at a time (never mixed).
import { supabase } from "@/lib/supabaseClient";

// The generated Database type doesn't know the renewal tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any;

export type DueKind = "ending_soon" | "expired" | "installment";
export type DueStage = "confirm" | "renewed" | "closed" | "promised" | "send_day0" | "send_day3" | "waiting" | "needs_nudge";

export interface AcademySetting {
  branch_id: string;
  code: "CLI" | "ICS";
  academy_name: string;
  upi_id: string | null;
  site_url: string;
}

export interface RenewalDue {
  id: string;
  token: string;
  branch_id: string;
  member_id: string | null;
  member_name: string;
  phone: string | null;
  due_kind: DueKind;
  package_label: string | null;
  package_months: number;
  package_fee: number;
  package_start: string;
  package_end: string;
  paid_so_far: number;
  amount_due: number;
  due_date: string;
  installment_label: string | null;
  renewal_months: number | null;
  renewal_start: string | null;
  renewal_end: string | null;
  sheet_sno: string | null;
  status: string;
  promise_date: string | null;
  reminder1_at: string | null;
  reminder2_at: string | null;
  claimed_at: string | null;
  desk_method: "cash" | "upi" | null;
  desk_marked_at: string | null;
  confirmed_at: string | null;
  thanked_at: string | null;
  tracker_logged_at: string | null;
  closed_reason: string | null;
  is_test: boolean;
  updated_at: string;
  academy_code: "CLI" | "ICS";
  academy_name: string;
  pay_url: string;
  stage: DueStage;
  repeat_on: string | null;
  possibly_leaving: boolean;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function d(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  const [y, m, day] = iso.slice(0, 10).split("-");
  return `${Number(day)} ${MON[Number(m) - 1]}${withYear ? " " + y : ""}`;
}

export function inr(n: number | null | undefined): string {
  return "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function firstName(name: string): string {
  const clean = name.replace(/\(.*?\)/g, "").trim();
  return clean.split(/\s+/)[0] || clean;
}

function months(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v}-month`;
}

/** WhatsApp number: last 10 digits with India's 91 prefix. */
export function waNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return "91" + digits.slice(-10);
}

export function waLink(phone: string | null, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

function detailLines(x: RenewalDue): string[] {
  const pkg = `${months(x.package_months)} package${x.package_label ? ` (${x.package_label})` : ""}: ${inr(x.package_fee)}, ${d(x.package_start)} – ${d(x.package_end)}`;
  const lines = [`Your ${pkg}`, `Paid so far: ${inr(x.paid_so_far)}`];
  if (x.due_kind === "installment") {
    lines.push(`Installment due${x.installment_label ? ` (${x.installment_label})` : ""}: ${inr(x.amount_due)}, due ${d(x.due_date, false)}`);
  } else {
    const when = x.due_kind === "expired" ? `ended on ${d(x.package_end, false)}` : `ends on ${d(x.package_end, false)}`;
    lines[0] += ` (${when})`;
    lines.push(
      `Renewal for the next ${Number(x.renewal_months ?? x.package_months) === 1 ? "month" : `${Number(x.renewal_months ?? x.package_months)} months`}${
        x.renewal_start ? ` (${d(x.renewal_start)} – ${d(x.renewal_end)})` : ""
      }: ${inr(x.amount_due)}`
    );
  }
  return lines;
}

/** Day 0 reminder. Respectful: details, pay link, then "Thank you". */
export function reminderMessage(x: RenewalDue): string {
  return [`Hi ${firstName(x.member_name)} 🙂`, ...detailLines(x), `Pay here: ${x.pay_url}`, "Thank you"].join("\n");
}

/** Day 3: the one gentle repeat. */
export function repeatMessage(x: RenewalDue): string {
  return [
    `Hi ${firstName(x.member_name)} 🙂 Sharing your package details again in case the earlier message got buried:`,
    ...detailLines(x),
    `Pay here: ${x.pay_url}`,
    "Thank you",
  ].join("\n");
}

export function thankYouMessage(x: RenewalDue): string {
  if (x.due_kind === "installment") {
    return `Hi ${firstName(x.member_name)}, received ${inr(x.amount_due)} towards your ${months(x.package_months)} package. Paid so far: ${inr(
      Number(x.paid_so_far) + Number(x.amount_due)
    )}. Thank you 🙏`;
  }
  return `Hi ${firstName(x.member_name)}, received ${inr(x.amount_due)} for your ${months(x.renewal_months ?? x.package_months)} package${
    x.renewal_start ? ` (${d(x.renewal_start)} – ${d(x.renewal_end)})` : ""
  }. Thank you 🙏`;
}

export function kindLabel(x: RenewalDue): string {
  if (x.due_kind === "installment") return `Installment${x.installment_label ? " " + x.installment_label : ""}`;
  if (x.due_kind === "expired") return `Expired ${d(x.package_end, false)}`;
  return `Ends ${d(x.package_end, false)}`;
}

export async function fetchAcademies(): Promise<AcademySetting[]> {
  const { data, error } = await sb.from("academy_settings").select("*").order("code");
  if (error) throw error;
  return (data ?? []) as AcademySetting[];
}

export async function fetchQueue(branchId: string): Promise<RenewalDue[]> {
  const { data, error } = await sb
    .from("v_renewal_queue")
    .select("*")
    .eq("branch_id", branchId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RenewalDue[];
}

export async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Weekly report buckets for one academy. */
export function weeklyReport(rows: RenewalDue[]) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const renewed = rows.filter(
    (r) =>
      (r.status === "confirmed" && r.confirmed_at && Date.parse(r.confirmed_at) >= weekAgo) ||
      (r.status === "closed" && r.closed_reason === "renewed_in_tracker" && Date.parse(r.updated_at) >= weekAgo)
  );
  const promised = rows.filter((r) => r.stage === "promised");
  const leaving = rows.filter((r) => r.possibly_leaving);
  const pending = rows.filter(
    (r) => ["send_day0", "send_day3", "waiting", "needs_nudge", "confirm"].includes(r.stage) && !r.possibly_leaving
  );
  const sum = (xs: RenewalDue[]) => xs.reduce((a, r) => a + Number(r.amount_due), 0);
  return {
    renewed: { count: renewed.length, amount: sum(renewed), rows: renewed },
    pending: { count: pending.length, amount: sum(pending), rows: pending },
    promised: { count: promised.length, amount: sum(promised), rows: promised },
    leaving: { count: leaving.length, amount: sum(leaving), rows: leaving },
  };
}
