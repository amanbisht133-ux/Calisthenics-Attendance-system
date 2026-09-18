import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/utils";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import type { MembershipPlan } from "@/lib/database.types";

const PLAN_MONTHS: Record<MembershipPlan, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
};

interface SyncableMember {
  id: string;
  name: string;
  phone: string;
  start_date: string;
  expiry_date: string;
  plan: MembershipPlan;
  sheet_person_no: number | null;
  sheet_renewal_no: number;
}

// Appends one row to the admin's Google Sheet for a new signup or a renewal.
// A member's first sync claims the next free "person number" from
// sheet_sync_settings; renewals reuse that number and bump the ".2"/".3"/...
// suffix. Best-effort: failures are returned as a message, not thrown, so
// callers can add/renew the member successfully even if the sheet is
// unreachable or not yet configured.
export async function syncMemberToSheet(
  member: SyncableMember,
  isRenewal: boolean
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

    const { data, error: fnError } = await supabase.functions.invoke("sync-member-to-sheet", {
      body: {
        sno,
        name: member.name,
        phone: member.phone,
        start_date: member.start_date,
        end_date: member.expiry_date,
        status,
        membership_months: PLAN_MONTHS[member.plan],
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
