// Called from the Admin Trainers "Delete" button. Verifies the caller is an
// admin, then tries to hard-delete the trainer's auth user. A trainer with
// any attendance/PT history can't be hard-deleted — attendance_records and
// pt_sessions reference trainer_id with ON DELETE RESTRICT, specifically so
// removing a trainer never silently destroys the gym's attendance history.
// When that happens, fall back to deactivating instead: ban login and hide
// from new-assignment pickers, but keep the account and its history intact.
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
    if (callerProfile.role !== "admin") throw new Error("Only admins can delete trainer accounts.");

    const { trainer_id } = await req.json();
    if (!trainer_id) throw new Error("trainer_id is required.");
    if (trainer_id === user.id) throw new Error("You can't delete your own account.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(trainer_id);
    if (!deleteError) {
      return new Response(JSON.stringify({ deleted: true, deactivated: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fall back to deactivation — ban future logins and mark inactive, since
    // the hard delete was blocked by referenced attendance/PT history.
    const { error: banError } = await adminClient.auth.admin.updateUserById(trainer_id, {
      ban_duration: "876000h",
    });
    if (banError) throw banError;

    const { error: deactivateError } = await adminClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", trainer_id);
    if (deactivateError) throw deactivateError;

    return new Response(JSON.stringify({ deleted: false, deactivated: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
