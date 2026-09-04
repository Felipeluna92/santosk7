import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const connectThreadsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    const token = typeof data?.token === "string" ? data.token.trim() : "";
    if (token.length < 20 || token.length > 2000) throw new Error("Token do Threads inválido.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { connectThreadsWithToken } = await import("./threads.server");
    const { writeLog } = await import("./meta.server");
    try {
      const account = await connectThreadsWithToken(data.token, context.userId);
      return { ok: true as const, username: account.username, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao validar o token do Threads.";
      await writeLog(context.userId, "token", "error", message);
      return { ok: false as const, username: null, error: message };
    }
  });
