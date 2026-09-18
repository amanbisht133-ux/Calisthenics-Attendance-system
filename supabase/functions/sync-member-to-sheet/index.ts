// Called after Add Member / Renew Membership. Appends one row to the admin's
// Google Sheet (via an Apps Script Web App configured in sheet_sync_settings)
// mirroring every field the app tracks, including fees, collection status,
// training type, and revenue splits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) throw new Error("Not authenticated.");

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    if (callerProfile.role !== "admin") throw new Error("Only admins can sync to the sheet.");

    const {
      sno,
      name,
      phone,
      email,
      start_date,
      end_date,
      status,
      membership_months,
      total_fee,
      collection_status,
      training_type,
      morning_evening,
      batch,
      cali_percent,
      cali_revenue,
      pt_trainer_rev,
      invoice_shared,
    } = await req.json();
    if (!sno || !name || !phone || !start_date || !end_date || !status || !membership_months) {
      throw new Error("sno, name, phone, start_date, end_date, status and membership_months are required.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings, error: settingsError } = await adminClient
      .from("sheet_sync_settings")
      .select("apps_script_url, apps_script_token")
      .eq("id", "singleton")
      .single();
    if (settingsError) throw settingsError;
    if (!settings.apps_script_url) {
      throw new Error("Spreadsheet sync isn't configured yet — set the Apps Script URL in Spreadsheet Sync settings.");
    }

    const requestBody = JSON.stringify({
      token: settings.apps_script_token,
      sno,
      name,
      phone,
      email: email ?? "",
      start_date,
      end_date,
      status,
      membership_months,
      total_fee: total_fee ?? "",
      collection_status: collection_status ?? "",
      training_type: training_type ?? "",
      morning_evening: morning_evening ?? "",
      batch: batch ?? "",
      cali_percent: cali_percent ?? "",
      cali_revenue: cali_revenue ?? "",
      pt_trainer_rev: pt_trainer_rev ?? 0,
      invoice_shared: invoice_shared ?? false,
    });

    // Google can return a stale/error response right after a new Apps Script
    // deployment even though the script itself executed correctly — retry
    // once after a short delay. This is safe: the sheet's own dedupe check
    // (matching on sno) means a retry can never append a duplicate row even
    // if the first attempt actually succeeded server-side.
    async function callSheet(): Promise<{ ok: true } | { ok: false; error: string }> {
      try {
        const resp = await fetch(settings.apps_script_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        const bodyText = await resp.text();
        if (!resp.ok) return { ok: false, error: `Sheet sync failed (${resp.status}): ${bodyText}` };

        let body: any;
        try {
          body = JSON.parse(bodyText);
        } catch {
          return { ok: false, error: `Sheet returned an unexpected response: ${bodyText.slice(0, 200)}` };
        }
        if (!body.ok) return { ok: false, error: body.error ?? "Sheet sync failed." };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }

    let result = await callSheet();
    if (!result.ok) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await callSheet();
    }
    if (!result.ok) throw new Error(result.error);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
