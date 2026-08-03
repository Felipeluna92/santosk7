import { createServerFn } from "@tanstack/react-start";

export const getMetaStatus = createServerFn({ method: "GET" }).handler(async () => {
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
  .inputValidator((data: { scopes?: string[] }) => data ?? {})
  .handler(async ({ data }) => {
    const { readMetaEnv, buildAuthorizationUrl, DEFAULT_SCOPES, writeLog } = await import("./meta.server");
    const env = readMetaEnv();
    if (!env.appId || !env.redirectUri) {
      return { url: null, error: "Configure META_APP_ID e META_REDIRECT_URI antes de conectar." };
    }
    const url = buildAuthorizationUrl(env, data.scopes?.length ? data.scopes : DEFAULT_SCOPES);
    await writeLog("oauth", "info", "URL de autorização oficial gerada.");
    return { url, error: null };
  });

export const syncAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data }) => {
    const { syncAccountById } = await import("./meta.server");
    return syncAccountById(data.accountId);
  });

export const publishPost = createServerFn({ method: "POST" })
  .inputValidator((data: { postId: string }) => data)
  .handler(async ({ data }) => {
    const { publishPostById } = await import("./meta.server");
    return publishPostById(data.postId);
  });

export const publishPending = createServerFn({ method: "POST" }).handler(async () => {
  const { publishPendingNow } = await import("./meta.server");
  return publishPendingNow();
});

export const disconnectAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeLog } = await import("./meta.server");
    await supabaseAdmin.from("account_tokens").delete().eq("account_id", data.accountId);
    await supabaseAdmin.from("instagram_accounts").delete().eq("id", data.accountId);
    await writeLog("accounts", "warn", "Conta removida do app e token descartado.");
    return { ok: true };
  });

export const connectManualToken = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => {
    const token = typeof data?.token === "string" ? data.token.trim() : "";
    if (token.length < 20 || token.length > 1000) throw new Error("Token inválido.");
    return { token };
  })
  .handler(async ({ data }) => {
    const { connectWithAccessToken, writeLog } = await import("./meta.server");
    try {
      const account = await connectWithAccessToken(data.token);
      return { ok: true as const, username: account.username, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao validar o token.";
      await writeLog("token", "error", message);
      return { ok: false as const, username: null, error: message };
    }
  });

export const getAccountsInsights = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAccountsInsights } = await import("./meta.server");
  return fetchAccountsInsights();
});

export const getInsightsTimeseries = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchInsightsTimeseries } = await import("./meta.server");
  return fetchInsightsTimeseries(30);
});
