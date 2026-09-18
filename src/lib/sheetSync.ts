import { supabase } from "@/lib/supabaseClient";
import { todayISO, timeSlotPeriod } from "@/lib/utils";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import type { BatchCategory, MembershipPlan } from "@/lib/database.types";

const PLAN_MONTHS: Record<MembershipPlan, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
};

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface SyncableMember {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  start_date: string;
  expiry_date: string;
  plan: MembershipPlan;
  sheet_person_no: number | null;
  sheet_renewal_no: number;
  total_fee: number | null;
  cali_percent: number | null;
  invoice_shared: boolean | null;
}

export interface SheetSyncExtras {
  // Total paid to date across every payment on record (not just this transaction).
  totalPaid: number;
  trainingType: "group" | "pt";
  batch?: { name: string; time_slot: string; category: BatchCategory } | null;
  trainerName?: string | null;
  trainerSharePercent?: number | null;
}

// Training Type is the gym's own real-world category, not the app's internal
// group/PT split: PT stays "PT", kids and weekend batches get their own
// label, and every other (weekday morning/evening) batch is just "Group" —
// the Morning/Evening column next to it carries the time-of-day split.
function trainingTypeLabel(extras: SheetSyncExtras): string {
  if (extras.trainingType === "pt") return "PT";
  if (!extras.batch) return "—";
  switch (extras.batch.category) {
    case "kids":
      return "Kids Batch";
    case "weekend":
      return "Weekend";
    default:
      return "Group";
  }
}

// Every batch (including Kids and Weekend) actually runs at some time of
// day — parse it from the time_slot rather than leaving it blank just
// because Training Type already names the category.
function morningEveningLabel(extras: SheetSyncExtras): string {
  if (extras.trainingType === "pt" || !extras.batch) return "—";
  const period = timeSlotPeriod(extras.batch.time_slot);
  if (period === "morning") return "Morning";
  if (period === "afternoon") return "Afternoon";
  if (period === "evening") return "Evening";
  return "—";
}

function collectionStatusLabel(totalFee: number | null, totalPaid: number): string {
  if (totalFee == null) return "—";
  if (totalPaid >= totalFee) return "Paid";
  if (totalPaid > 0) return `Partially Paid (₹${totalPaid})`;
  return "Yet to Pay";
}

// Splits the total fee evenly across the membership's calendar months (e.g.
// a 3-month ₹18888 plan starting in September is ₹6296 each in Sep/Oct/Nov),
// then fills those month columns in order with what's actually been paid —
// the last partially-covered month gets whatever's left over, so the filled
// columns always sum to exactly totalPaid, never more.
function monthlyBreakdown(startDateISO: string, planMonths: number, totalFee: number | null, totalPaid: number) {
  const result: Record<string, number | ""> = {};
  for (const key of MONTH_KEYS) result[key] = "";
  if (totalFee == null || totalFee <= 0 || planMonths <= 0) return result;

  const perMonth = totalFee / planMonths;
  const [y, m, d] = startDateISO.split("-").map(Number);
  const start = new Date(y, m - 1, d);

  let remaining = totalPaid;
  for (let i = 0; i < planMonths && remaining > 0; i++) {
    const monthIndex = (start.getMonth() + i) % 12;
    const key = MONTH_KEYS[monthIndex];
    const amountForMonth = Math.min(perMonth, remaining);
    const existing = result[key] === "" ? 0 : (result[key] as number);
    result[key] = Math.round(existing + amountForMonth);
    remaining -= amountForMonth;
  }
  return result;
}

// Appends one row to the admin's Google Sheet for a new signup or a renewal.
// A member's first sync claims the next free "person number" from
// sheet_sync_settings; renewals reuse that number and bump the ".2"/".3"/...
// suffix. Best-effort: failures are returned as a message, not thrown, so
// callers can add/renew the member successfully even if the sheet is
// unreachable or not yet configured.
export async function syncMemberToSheet(
  member: SyncableMember,
  isRenewal: boolean,
  extras: SheetSyncExtras
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let personNo = member.sheet_person_no;
    let renewalNo = member.sheet_renewal_no ?? 1;

    if (!isRenewal || personNo == null) {
      const { data: settings, error: settingsError } = await supabase
        .from("sheet_sync_settings")
        .select("next_person_no")
        .eq("id", "singleton")
        .single();
      if (settingsError) throw settingsError;

      personNo = settings.next_person_no;
      renewalNo = 1;

      const { error: bumpError } = await supabase
        .from("sheet_sync_settings")
        .update({ next_person_no: settings.next_person_no + 1 })
        .eq("id", "singleton");
      if (bumpError) throw bumpError;
    } else {
      renewalNo = renewalNo + 1;
    }

    const sno = renewalNo === 1 ? String(personNo) : `${personNo}.${renewalNo}`;
    const status = member.expiry_date < todayISO() ? "Expired" : "Active";

    const totalFee = member.total_fee;
    const caliPercent = member.cali_percent;
    const caliRevenue = totalFee != null && caliPercent != null ? Math.round((totalFee * caliPercent) / 100) : null;
    // Always a number, not blank — 0 for Group members or when no share % is on file.
    const ptRevenue =
      extras.trainingType === "pt" && totalFee != null && extras.trainerSharePercent != null
        ? Math.round((totalFee * extras.trainerSharePercent) / 100)
        : 0;
    const batchLabel = extras.batch ? extras.batch.time_slot : "";
    const planMonths = PLAN_MONTHS[member.plan];
    const months = monthlyBreakdown(member.start_date, planMonths, totalFee, extras.totalPaid);

    const { data, error: fnError } = await supabase.functions.invoke("sync-member-to-sheet", {
      body: {
        sno,
        name: member.name,
        phone: member.phone,
        email: member.email ?? "",
        start_date: member.start_date,
        end_date: member.expiry_date,
        status,
        membership_months: planMonths,
        total_fee: totalFee ?? "",
        collection_status: collectionStatusLabel(totalFee, extras.totalPaid),
        training_type: trainingTypeLabel(extras),
        morning_evening: morningEveningLabel(extras),
        batch: batchLabel,
        cali_percent: caliPercent ?? "",
        cali_revenue: caliRevenue ?? "",
        pt_trainer_rev: ptRevenue,
        invoice_shared: !!member.invoice_shared,
        month_jan: months.jan,
        month_feb: months.feb,
        month_mar: months.mar,
        month_apr: months.apr,
        month_may: months.may,
        month_jun: months.jun,
        month_jul: months.jul,
        month_aug: months.aug,
        month_sep: months.sep,
        month_oct: months.oct,
        month_nov: months.nov,
        month_dec: months.dec,
      },
    });
    if (fnError) throw new Error(await extractFunctionErrorMessage(fnError, "Failed to call sync-member-to-sheet."));
    if (data?.error) throw new Error(data.error);

    const { error: saveError } = await supabase
      .from("members")
      .update({ sheet_person_no: personNo, sheet_renewal_no: renewalNo })
      .eq("id", member.id);
    if (saveError) throw saveError;

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to sync to sheet." };
  }
}
