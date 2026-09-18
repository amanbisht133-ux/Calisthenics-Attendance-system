import { FunctionsHttpError } from "@supabase/supabase-js";

// supabase-js's default error message for a non-2xx Edge Function response is
// just "Edge Function returned a non-2xx status code" -- the actual reason
// (what our function put in its JSON error body) is on FunctionsHttpError's
// `context`, which is the raw Response.
export async function extractFunctionErrorMessage(fnError: unknown, fallback = "Edge Function call failed."): Promise<string> {
  if (fnError instanceof FunctionsHttpError) {
    try {
      const body = await fnError.context.json();
      if (body?.error) return body.error as string;
    } catch {
      // Body wasn't JSON -- fall through to the generic message below.
    }
  }
  return fnError instanceof Error ? fnError.message : fallback;
}
