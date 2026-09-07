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

export const getThreadsAuthorizationUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { state: string }) => {
    const state = typeof data?.state === "string" ? data.state.trim() : "";
    if (!/^[a-zA-Z0-9_-]{32,128}$/.test(state)) throw new Error("Estado de conexão inválido.");
    return { state };
  })
  .handler(async ({ data }) => {
    const { readThreadsEnv, buildThreadsAuthorizationUrl } = await import("./threads.server");
    const env = readThreadsEnv();
    if (!env.appId || !env.appSecret) {
      return { url: null, callbackOrigin: null, error: "Configure o app do Threads no servidor antes de conectar." };
    }
    return {
      url: buildThreadsAuthorizationUrl(env, data.state),
      callbackOrigin: new URL(env.redirectUri).origin,
      error: null,
    };
  });

export const completeThreadsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => {
    const code = typeof data?.code === "string" ? data.code.trim() : "";
    if (!code || code.length > 2048) throw new Error("Código de autorização inválido.");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { exchangeThreadsCodeForAccount } = await import("./threads.server");
    const account = await exchangeThreadsCodeForAccount(data.code.replace(/#_$/, ""), context.userId);
    return { ok: true as const, username: account.username };
  });
