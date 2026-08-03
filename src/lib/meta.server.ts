// Server-only helpers for the official Meta / Instagram Graph API.
// Never import this from client code.

const REDACT_KEYS = ["access_token", "authorization", "secret", "password", "refresh_token"];

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const k of REDACT_KEYS) {
      const re = new RegExp(`(${k}"?\\s*[:=]\\s*"?)([^"&,\\s}]+)`, "gi");
      out = out.replace(re, `$1[REDACTED]`);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.includes(k.toLowerCase()) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export type MetaEnv = {
  appId: string | null;
  appSecret: string | null;
  graphVersion: string;
  redirectUri: string | null;
  appBaseUrl: string | null;
};

export function readMetaEnv(): MetaEnv {
  return {
    appId: process.env["META_APP_ID"] ?? null,
    appSecret: process.env["META_APP_SECRET"] ?? null,
    graphVersion: process.env["META_GRAPH_VERSION"] ?? "v23.0",
    redirectUri: process.env["META_REDIRECT_URI"] ?? null,
    appBaseUrl: process.env["APP_BASE_URL"] ?? null,
  };
}

export const DEFAULT_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
];

export async function writeLog(
  area: string,
  level: "info" | "warn" | "error" | "success",
  message: string,
  metadata: unknown = {},
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs").insert({
      area,
      level,
      message: String(redact(message)),
      metadata: redact(metadata) as never,
    });
  } catch (e) {
    console.error("log write failed", e);
  }
}

/** Turns a raw Meta error payload into human readable Brazilian Portuguese. */
export function humanizeMetaError(payload: unknown): string {
  const err = (payload as { error?: { message?: string; code?: number; error_user_msg?: string } })
    ?.error;
  if (!err) return "Erro desconhecido ao falar com a API da Meta.";
  if (err.error_user_msg) return err.error_user_msg;
  const map: Record<number, string> = {
    190: "O token de acesso expirou ou foi revogado. Reconecte a conta.",
    10: "Sua conta ou app não tem permissão para essa ação. Verifique as permissões aprovadas.",
    100: "Parâmetro inválido enviado à Meta. Verifique a URL da mídia e o tipo de post.",
    200: "Permissão insuficiente. O app precisa da permissão de publicação aprovada.",
    9007: "A mídia não pôde ser baixada pela Meta. A URL precisa ser pública e direta.",
  };
  return (err.code && map[err.code]) || err.message || "Erro na API da Meta.";
}

async function graph(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json["error"]) {
    throw new Error(humanizeMetaError(json));
  }
  return json;
}

export function buildAuthorizationUrl(env: MetaEnv, scopes: string[]) {
  const params = new URLSearchParams({
    client_id: env.appId!,
    redirect_uri: env.redirectUri!,
    response_type: "code",
    scope: scopes.join(","),
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForAccount(code: string) {
  const env = readMetaEnv();
  if (!env.appId || !env.appSecret || !env.redirectUri) {
    throw new Error("Credenciais da Meta não configuradas no servidor.");
  }

  const body = new URLSearchParams({
    client_id: env.appId,
    client_secret: env.appSecret,
    grant_type: "authorization_code",
    redirect_uri: env.redirectUri,
    code,
  });

  const short = await graph("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const shortToken = String(short["access_token"] ?? "");
  const grantedScopes = Array.isArray(short["permissions"])
    ? (short["permissions"] as string[])
    : String(short["permissions"] ?? "").split(",").filter(Boolean);

  // Exchange for a long-lived token (60 days).
  const long = await graph(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      env.appSecret,
    )}&access_token=${encodeURIComponent(shortToken)}`,
  );
  const token = String(long["access_token"] ?? shortToken);
  const expiresIn = Number(long["expires_in"] ?? 60 * 60 * 24 * 60);

  const me = await graph(
    `https://graph.instagram.com/${env.graphVersion}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(
      token,
    )}`,
  );

  const igUserId = String(me["user_id"] ?? me["id"] ?? "");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: account, error } = await supabaseAdmin
    .from("instagram_accounts")
    .upsert(
      {
        instagram_user_id: igUserId,
        username: String(me["username"] ?? "conta"),
        display_name: (me["name"] as string) ?? null,
        profile_picture_url: (me["profile_picture_url"] as string) ?? null,
        account_type: (me["account_type"] as string) ?? "BUSINESS",
        scopes: grantedScopes.length ? grantedScopes : DEFAULT_SCOPES,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        last_sync_at: new Date().toISOString(),
        status: "connected",
      },
      { onConflict: "instagram_user_id" },
    )
    .select("id, username")
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("account_tokens")
    .upsert({ account_id: account.id, access_token: token }, { onConflict: "account_id" });

  await writeLog("oauth", "success", `Conta @${account.username} conectada com sucesso.`, {
    account_id: account.id,
  });

  return account;
}

/** Manual connection: validates a user-supplied token against the official Graph API. */
export async function connectWithAccessToken(rawToken: string) {
  const env = readMetaEnv();
  const input = rawToken.trim();
  if (input.length < 20) throw new Error("Token inválido. Cole o token de acesso completo.");

  let token = input;
  let expiresIn: number | null = null;

  // If app credentials exist, try upgrading to a long-lived token (60 dias).
  if (env.appSecret) {
    try {
      const long = await graph(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
          env.appSecret,
        )}&access_token=${encodeURIComponent(token)}`,
      );
      if (long["access_token"]) token = String(long["access_token"]);
      expiresIn = Number(long["expires_in"] ?? 0) || null;
    } catch {
      // Token may already be long-lived; segue com o token informado.
    }
  }

  const me = await graph(
    `https://graph.instagram.com/${env.graphVersion}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(
      token,
    )}`,
  );

  const igUserId = String(me["user_id"] ?? me["id"] ?? "");
  if (!igUserId) throw new Error("Não foi possível identificar a conta do Instagram com esse token.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account, error } = await supabaseAdmin
    .from("instagram_accounts")
    .upsert(
      {
        instagram_user_id: igUserId,
        username: String(me["username"] ?? "conta"),
        display_name: (me["name"] as string) ?? null,
        profile_picture_url: (me["profile_picture_url"] as string) ?? null,
        account_type: (me["account_type"] as string) ?? null,
        scopes: DEFAULT_SCOPES,
        token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        last_sync_at: new Date().toISOString(),
        status: "connected",
      },
      { onConflict: "instagram_user_id" },
    )
    .select("id, username")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("account_tokens")
    .upsert({ account_id: account.id, access_token: token }, { onConflict: "account_id" });

  await writeLog("token", "success", `Conta @${account.username} conectada por token manual.`, {
    account_id: account.id,
  });

  return { id: account.id, username: account.username };
}

async function tokenFor(accountId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("account_tokens")
    .select("access_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data?.access_token) throw new Error("Conta sem token válido. Reconecte a conta.");
  return data.access_token;
}

export async function syncAccountById(accountId: string) {
  const env = readMetaEnv();
  const token = await tokenFor(accountId);
  const me = await graph(
    `https://graph.instagram.com/${env.graphVersion}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(
      token,
    )}`,
  );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("instagram_accounts")
    .update({
      username: String(me["username"] ?? ""),
      display_name: (me["name"] as string) ?? null,
      profile_picture_url: (me["profile_picture_url"] as string) ?? null,
      account_type: (me["account_type"] as string) ?? null,
      last_sync_at: new Date().toISOString(),
      status: "connected",
    })
    .eq("id", accountId);
  await writeLog("sync", "info", `Conta sincronizada (@${me["username"]}).`, { accountId });
  return { ok: true };
}

function isPublicHttpUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname))
      return false;
    return true;
  } catch {
    return false;
  }
}

async function createContainer(
  igUserId: string,
  token: string,
  version: string,
  fields: Record<string, string>,
) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const json = await graph(`https://graph.instagram.com/${version}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return String(json["id"]);
}

async function waitForContainer(containerId: string, token: string, version: string) {
  for (let i = 0; i < 30; i++) {
    const json = await graph(
      `https://graph.instagram.com/${version}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const status = String(json["status_code"] ?? "");
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`A Meta não conseguiu processar a mídia (${String(json["status"] ?? status)}).`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Tempo esgotado aguardando a Meta processar o vídeo.");
}

export async function publishPostById(postId: string) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: post } = await supabaseAdmin.from("posts").select("*").eq("id", postId).single();
  if (!post) throw new Error("Post não encontrado.");
  if (!post.account_id) throw new Error("Selecione uma conta antes de publicar.");

  const { data: account } = await supabaseAdmin
    .from("instagram_accounts")
    .select("*")
    .eq("id", post.account_id)
    .single();
  if (!account) throw new Error("Conta não encontrada.");
  if (!(account.scopes ?? []).includes("instagram_business_content_publish")) {
    throw new Error(
      "Esta conta não tem a permissão instagram_business_content_publish aprovada. Reconecte concedendo a permissão.",
    );
  }
  if (account.account_type && !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(account.account_type)) {
    throw new Error("Publicação só é permitida em contas Instagram Business ou Creator.");
  }

  await supabaseAdmin.from("posts").update({ status: "publishing", error_message: null }).eq("id", postId);

  try {
    const token = await tokenFor(post.account_id);
    const igId = account.instagram_user_id;
    const caption = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");
    let containerId: string;

    if (post.type === "CAROUSEL") {
      const urls = (post.carousel_urls ?? []).filter(Boolean);
      if (urls.length < 2) throw new Error("Um carrossel precisa de pelo menos 2 mídias.");
      if (urls.length > 10) throw new Error("Um carrossel aceita no máximo 10 mídias.");
      for (const u of urls) {
        if (!isPublicHttpUrl(u)) throw new Error(`URL inválida ou não pública: ${u}`);
      }
      const children: string[] = [];
      for (const url of urls) {
        const isVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(url);
        const child = await createContainer(igId, token, env.graphVersion, {
          is_carousel_item: "true",
          ...(isVideo ? { video_url: url, media_type: "VIDEO" } : { image_url: url }),
        });
        if (isVideo) await waitForContainer(child, token, env.graphVersion);
        children.push(child);
      }
      containerId = await createContainer(igId, token, env.graphVersion, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      });
    } else {
      const url = post.media_url ?? "";
      if (!isPublicHttpUrl(url))
        throw new Error("Informe uma URL pública e direta da mídia (a Meta precisa baixá-la).");
      if (post.type === "REEL") {
        containerId = await createContainer(igId, token, env.graphVersion, {
          media_type: "REELS",
          video_url: url,
          caption,
        });
        await waitForContainer(containerId, token, env.graphVersion);
      } else {
        containerId = await createContainer(igId, token, env.graphVersion, {
          image_url: url,
          caption,
        });
      }
    }

    await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);

    const published = await graph(`https://graph.instagram.com/${env.graphVersion}/${igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    });

    const mediaId = String(published["id"] ?? "");
    await supabaseAdmin
      .from("posts")
      .update({
        status: "published",
        meta_media_id: mediaId,
        published_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", postId);

    await writeLog("publish", "success", `Publicado com sucesso (${post.type}).`, {
      postId,
      mediaId,
      containerId,
    });
    return { ok: true, mediaId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha desconhecida ao publicar.";
    await supabaseAdmin.from("posts").update({ status: "failed", error_message: message }).eq("id", postId);
    await writeLog("publish", "error", message, { postId });
    throw new Error(message);
  }
}

export async function publishPendingNow() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pending } = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  let ok = 0;
  let failed = 0;
  for (const p of pending ?? []) {
    try {
      await publishPostById(p.id);
      ok++;
    } catch {
      failed++;
    }
  }
  await writeLog("scheduler", "info", `Publicação de pendentes executada: ${ok} ok, ${failed} falhas.`);
  return { ok, failed, total: (pending ?? []).length };
}
