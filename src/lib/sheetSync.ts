import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/utils";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import type { BatchCategory, MembershipPlan } from "@/lib/database.types";

const PLAN_MONTHS: Record<MembershipPlan, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
};

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

function morningEveningLabel(category: BatchCategory | undefined): string {
  switch (category) {
    case "weekday_evening":
      return "Evening";
    case "kids":
      return "Kids";
    case "weekend":
      return "Weekend";
    case "weekday_morning":
      return "Morning";
    default:
      return "—";
  }
}

function collectionStatusLabel(totalFee: number | null, totalPaid: number): string {
  if (totalFee == null) return "—";
  if (totalPaid >= totalFee) return "Paid";
  if (totalPaid > 0) return `Partially Paid (₹${totalPaid})`;
  return "Yet to Pay";
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
    const ptRevenue =
      extras.trainingType === "pt" && totalFee != null && extras.trainerSharePercent != null
        ? Math.round((totalFee * extras.trainerSharePercent) / 100)
        : null;
    const trainingTypeLabel =
      extras.trainingType === "pt" ? `PT- ${extras.trainerName ?? "?"}` : extras.batch ? "Group" : "—";
    const morningEvening = extras.trainingType === "pt" ? "—" : morningEveningLabel(extras.batch?.category);
    const batchLabel = extras.batch ? `${extras.batch.name} (${extras.batch.time_slot})` : "";

    const { data, error: fnError } = await supabase.functions.invoke("sync-member-to-sheet", {
      body: {
        sno,
        name: member.name,
        phone: member.phone,
        email: member.email ?? "",
        start_date: member.start_date,
        end_date: member.expiry_date,
        status,
        membership_months: PLAN_MONTHS[member.plan],
        total_fee: totalFee ?? "",
        collection_status: collectionStatusLabel(totalFee, extras.totalPaid),
        training_type: trainingTypeLabel,
        morning_evening: morningEvening,
        batch: batchLabel,
        cali_percent: caliPercent ?? "",
        cali_revenue: caliRevenue ?? "",
        pt_trainer_rev: ptRevenue ?? "",
        invoice_shared: member.invoice_shared ? "Yes" : "No",
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
