// Called from Admin → Team ("Add trainer" / "Add admin"). Verifies the caller
// is an admin, then uses the service-role key to create the login straight
// away: no confirmation email and no welcome email. The admin shares the
// username and password with the person directly.
//
// A login can be a plain username (e.g. "shiva"); it is stored as
// "<username>@staff.calisthenicshq.app" because the auth system needs an
// email-shaped id. The login screen adds that suffix automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const STAFF_DOMAIN = "staff.calisthenicshq.app";

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
    if (callerProfile.role !== "admin") throw new Error("Only admins can add team members.");

    const body = await req.json();
    const full_name: string = (body.full_name ?? "").trim();
    const password: string = body.password ?? "";
    const phone: string | undefined = body.phone || undefined;
    const role: "trainer" | "admin" = body.role === "admin" ? "admin" : "trainer";
    const branch_ids: string[] = Array.isArray(body.branch_ids) ? body.branch_ids : [];
    const loginRaw: string = (body.login ?? body.email ?? "").trim().toLowerCase();

    if (!full_name) throw new Error("Name is required.");
    if (!loginRaw) throw new Error("Username is required.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (!loginRaw.includes("@") && !/^[a-z0-9._-]+$/.test(loginRaw)) {
      throw new Error("Username can only use letters, numbers, dots, dashes and underscores.");
    }
    const email = loginRaw.includes("@") ? loginRaw : `${loginRaw}@${STAFF_DOMAIN}`;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (createError) {
      if (/already/i.test(createError.message)) throw new Error("That username is already taken. Pick another.");
      throw createError;
    }
    const id = created.user!.id;

    // handle_new_user() already inserted the profile; make sure role/phone are right.
    await adminClient.from("profiles").update({ role, ...(phone ? { phone } : {}) }).eq("id", id);

    if (role === "trainer" && branch_ids.length > 0) {
      const { error: branchError } = await adminClient
        .from("trainer_branches")
        .insert(branch_ids.map((branch_id) => ({ trainer_id: id, branch_id })));
      if (branchError) throw branchError;
    }

    return new Response(JSON.stringify({ id, login: loginRaw }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
