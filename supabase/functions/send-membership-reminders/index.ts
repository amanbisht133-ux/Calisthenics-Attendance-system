// Called from Admin -> Reminders "Send Reminder Emails" button. Sends one
// personalized renewal-reminder email per selected member via Resend. The
// client supplies each member's name/email/expiry/status directly (it already
// has this loaded and classified) so this function does no extra DB lookups
// or date-math that could drift from what the admin is looking at.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail, emailShell } from "../_shared/resend.ts";

interface ReminderTarget {
  id: string;
  name: string;
  email: string;
  expiry_date: string;
  status: "expired" | "expiring_soon";
}

function reminderEmail(m: ReminderTarget) {
  const isExpired = m.status === "expired";
  const dateStr = new Date(m.expiry_date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const heading = isExpired ? "Your membership has expired" : "Your membership is expiring soon";
  const message = isExpired
    ? `Hi ${m.name}, your membership expired on <strong>${dateStr}</strong>. We'd love to have you back — renew today to jump back in!`
    : `Hi ${m.name}, your membership is expiring on <strong>${dateStr}</strong>. Renew now to keep your spot without any gap.`;
  return {
    subject: isExpired ? "Your gym membership has expired" : "Your gym membership is expiring soon",
    html: emailShell(heading, `<p style="color:#c9cdc4; line-height:1.6;">${message}</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    if (callerProfile.role !== "admin") throw new Error("Only admins can send bulk reminders.");

    const { members } = (await req.json()) as { members: ReminderTarget[] };
    if (!Array.isArray(members) || members.length === 0) throw new Error("members is required.");

    let sent = 0;
    const failed: { id: string; name: string; error: string }[] = [];

    for (const m of members) {
      if (!m.email) continue;
      try {
        const { subject, html } = reminderEmail(m);
        await sendEmail({ to: [m.email], subject, html });
        sent++;
      } catch (e) {
        failed.push({ id: m.id, name: m.name, error: (e as Error).message });
      }
    }

    const skipped = members.filter((m) => !m.email).length;

    return new Response(JSON.stringify({ sent, skipped, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
