// Called from the Admin Trainers "Edit" modal. Verifies the caller is an
// admin, then uses the service-role key to update the trainer's auth user
// (email/password) and profile row (full_name/phone/email). If a new
// password is set, emails the trainer their updated credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { trainerCredentialsUpdatedEmail } from "../_shared/trainerEmail.ts";

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
    if (callerProfile.role !== "admin") throw new Error("Only admins can edit trainer accounts.");

    const { trainer_id, full_name, phone, email, new_password } = await req.json();
    if (!trainer_id) throw new Error("trainer_id is required.");
    if (new_password && new_password.length < 6) throw new Error("New password must be at least 6 characters.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing, error: fetchError } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", trainer_id)
      .single();
    if (fetchError) throw fetchError;

    // Auth user fields (email/password) live in auth.users, not profiles.
    const authUpdate: { email?: string; password?: string } = {};
    if (email && email !== existing.email) authUpdate.email = email;
    if (new_password) authUpdate.password = new_password;
    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(trainer_id, {
        ...authUpdate,
        email_confirm: authUpdate.email ? true : undefined,
      });
      if (authError) throw authError;
    }

    const profileUpdate: Record<string, unknown> = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (phone !== undefined) profileUpdate.phone = phone;
    if (email) profileUpdate.email = email;
    if (Object.keys(profileUpdate).length > 0) {
      const { error: updateError } = await adminClient.from("profiles").update(profileUpdate).eq("id", trainer_id);
      if (updateError) throw updateError;
    }

    let emailError: string | null = null;
    if (new_password) {
      try {
        const targetEmail = email || existing.email;
        const targetName = full_name || existing.full_name;
        const { subject, html } = trainerCredentialsUpdatedEmail(targetName, targetEmail, new_password);
        await sendEmail({ to: [targetEmail], subject, html });
      } catch (e) {
        emailError = (e as Error).message;
      }
    }

    return new Response(JSON.stringify({ ok: true, emailError }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
