import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns the public HTTPS base used to serve uploaded media to the Meta API. */
export const getUploadBaseUrl = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const base = process.env["APP_BASE_URL"] ?? null;
  return { baseUrl: base ? base.replace(/\/+$/, "") : null };
});
