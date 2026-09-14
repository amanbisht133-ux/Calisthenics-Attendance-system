// Runs once weekly (see supabase/migrations/0005_cron.sql for scheduling).
// Emails every admin the current list of expired memberships.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: expired, error: expiredError } = await supabase
      .from("v_expired_members")
      .select("name, phone, plan, expiry_date")
      .order("expiry_date", { ascending: false });
    if (expiredError) throw expiredError;

    const { data: admins, error: adminsError } = await supabase
      .from("profiles")
      .select("email")
      .eq("role", "admin");
    if (adminsError) throw adminsError;

    const adminEmails = (admins ?? []).map((a) => a.email).filter(Boolean);
    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No admin emails found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = expired ?? [];
    const tableRows =
      rows.length > 0
        ? rows
            .map(
              (m: any) => `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #2e322a;">${m.name}</td>
          <td style="padding:8px; border-bottom:1px solid #2e322a;">${m.phone}</td>
          <td style="padding:8px; border-bottom:1px solid #2e322a;">${m.plan}</td>
          <td style="padding:8px; border-bottom:1px solid #2e322a; color:#F87171;">${m.expiry_date}</td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="4" style="padding:12px; color:#8b8f87;">No expired memberships. 🎉</td></tr>`;

    const html = emailShell(
      `Weekly Expired Membership Report — ${today}`,
      `<table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="text-align:left; color:#8b8f87; text-transform:uppercase; font-size:11px;">
            <th style="padding:8px;">Name</th><th style="padding:8px;">Phone</th><th style="padding:8px;">Plan</th><th style="padding:8px;">Expired On</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin-top:16px; color:#8b8f87; font-size:13px;">Total: ${rows.length} expired membership(s).</p>`
    );

    await sendEmail({
      to: adminEmails,
      subject: `Weekly Expired Membership Report — ${rows.length} expired`,
      html,
    });

    return new Response(JSON.stringify({ sent: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
