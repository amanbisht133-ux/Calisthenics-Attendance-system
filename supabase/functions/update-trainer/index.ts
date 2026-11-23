// Called from Admin → Team "Edit". Verifies the caller is an admin, then
// uses the service-role key to update a team member's name, phone and
// (optionally) password. No emails are sent: the admin tells the person
// their new password directly. Academy assignment is saved from the app
// (trainer_branches is admin-writable).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
    } = await authClient.auth.getUser(token);
    if (!user) throw new Error("Not authenticated. Please sign out and sign in again.");

    const { data: callerProfile, error: profileError } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    if (callerProfile.role !== "admin") throw new Error("Only admins can edit team members.");

    const { trainer_id, full_name, phone, new_password, new_login } = await req.json();
    if (!trainer_id) throw new Error("trainer_id is required.");
    if (new_password && new_password.length < 6) throw new Error("New password must be at least 6 characters.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let newEmail: string | undefined;
    if (typeof new_login === "string" && new_login.trim()) {
      const l = new_login.trim().toLowerCase();
      if (!l.includes("@") && !/^[a-z0-9._-]+$/.test(l)) {
        throw new Error("Username can only use letters, numbers, dots, dashes and underscores.");
      }
      newEmail = l.includes("@") ? l : `${l}@staff.calisthenicshq.app`;
      const { error: emailErr } = await adminClient.auth.admin.updateUserById(trainer_id, {
        email: newEmail,
        email_confirm: true,
      });
      if (emailErr) {
        if (/already|exists|registered/i.test(emailErr.message)) throw new Error("That username is already taken. Pick another.");
        throw emailErr;
      }
    }

    if (new_password) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(trainer_id, { password: new_password });
      if (authError) throw authError;
    }

    const profileUpdate: Record<string, unknown> = {};
    if (newEmail) profileUpdate.email = newEmail;
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (phone !== undefined) profileUpdate.phone = phone;
    if (Object.keys(profileUpdate).length > 0) {
      const { error: updateError } = await adminClient.from("profiles").update(profileUpdate).eq("id", trainer_id);
      if (updateError) throw updateError;
    }

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
