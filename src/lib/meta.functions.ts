import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMetaStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { readMetaEnv, DEFAULT_SCOPES } = await import("./meta.server");
  const env = readMetaEnv();
  return {
    hasAppId: Boolean(env.appId),
    hasAppSecret: Boolean(env.appSecret),
    graphVersion: env.graphVersion,
    redirectUri: env.redirectUri,
    appBaseUrl: env.appBaseUrl,
    scopes: DEFAULT_SCOPES,
    ready: Boolean(env.appId && env.appSecret && env.redirectUri),
  };
});

export const getAuthorizationUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { scopes?: string[]; state: string }) => {
    const state = typeof data?.state === "string" ? data.state.trim() : "";
    if (!/^[a-zA-Z0-9_-]{32,128}$/.test(state)) throw new Error("Estado de conexão inválido.");
    return { scopes: data?.scopes, state };
  })
  .handler(async ({ data, context }) => {
    const { readMetaEnv, buildAuthorizationUrl, DEFAULT_SCOPES, writeLog } = await import("./meta.server");
    const env = readMetaEnv();
    if (!env.appId || !env.redirectUri) {
      return { url: null, error: "Configure META_APP_ID e META_REDIRECT_URI antes de conectar." };
    }
    const url = buildAuthorizationUrl(env, data.scopes?.length ? data.scopes : DEFAULT_SCOPES, data.state);
    await writeLog(context.userId, "oauth", "info", "URL de autorização oficial gerada.");
    return { url, callbackOrigin: env.appBaseUrl, error: null };
  });

export const completeInstagramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => {
    const code = typeof data?.code === "string" ? data.code.trim() : "";
    if (!code || code.length > 2048) throw new Error("Código de autorização inválido.");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { exchangeCodeForAccount } = await import("./meta.server");
    const account = await exchangeCodeForAccount(data.code, context.userId);
    return { ok: true as const, username: account.username };
  });

export const syncAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { syncAccountById } = await import("./meta.server");
    return syncAccountById(data.accountId, context.userId);
  });

export const publishPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postId: string }) => data)
  .handler(async ({ data, context }) => {
    const { publishPostById } = await import("./meta.server");
    return publishPostById(data.postId, context.userId);
  });

export const publishPending = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { publishPendingNow } = await import("./meta.server");
  return publishPendingNow(context.userId);
});

export const disconnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeLog } = await import("./meta.server");
    const { data: owned } = await supabaseAdmin.from("instagram_accounts").select("id").eq("id", data.accountId).eq("user_id", context.userId).maybeSingle();
    if (!owned) throw new Error("Conta não encontrada.");
    await supabaseAdmin.from("account_tokens").delete().eq("account_id", data.accountId).eq("user_id", context.userId);
    await supabaseAdmin.from("instagram_accounts").delete().eq("id", data.accountId).eq("user_id", context.userId);
    await writeLog(context.userId, "accounts", "warn", "Conta removida do app e token descartado.");
    return { ok: true };
  });

export const connectManualToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    const token = typeof data?.token === "string" ? data.token.trim() : "";
    if (token.length < 20 || token.length > 1000) throw new Error("Token inválido.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { connectWithAccessToken, writeLog } = await import("./meta.server");
    try {
      const account = await connectWithAccessToken(data.token, context.userId);
      return { ok: true as const, username: account.username, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao validar o token.";
      await writeLog(context.userId, "token", "error", message);
      return { ok: false as const, username: null, error: message };
    }
  });

export const getAccountsInsights = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { fetchAccountsInsights } = await import("./meta.server");
  return fetchAccountsInsights(context.userId);
});

export const getInsightsTimeseries = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { fetchInsightsTimeseries } = await import("./meta.server");
  return fetchInsightsTimeseries(context.userId, 14);
});
