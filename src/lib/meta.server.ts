// Server-only helpers for the official Meta / Instagram Graph API.
// Never import this from client code.

import {
  MANUAL_PUBLISH_CLAIMABLE,
  POST_STATUS_FAILED,
  POST_STATUS_PUBLISHING,
  POST_STATUS_RETRYING,
  POST_STATUS_SCHEDULED,
  SCHEDULER_QUEUE_STATUSES,
} from "./domain";

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

/** URL de callback oficial de produção. Deve estar cadastrada IGUAL no painel da Meta. */
export const PRODUCTION_REDIRECT_URI =
  "https://santosk7.lovable.app/api/public/oauth/instagram/callback";


export function readMetaEnv(): MetaEnv {
  return {
    appId: process.env["META_APP_ID"] ?? null,
    appSecret: process.env["META_APP_SECRET"] ?? null,
    graphVersion: process.env["META_GRAPH_VERSION"] ?? "v23.0",
    // redirect_uri centralizada: nunca derivar da URL do navegador.
    redirectUri:
      process.env["INSTAGRAM_REDIRECT_URI"] ?? process.env["META_REDIRECT_URI"] ?? null,
    appBaseUrl: process.env["APP_BASE_URL"] ?? null,
  };
}

export const DEFAULT_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
];

export async function writeLog(
  userId: string,
  area: string,
  level: "info" | "warn" | "error" | "success",
  message: string,
  metadata: unknown = {},
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("logs").insert({
      user_id: userId,
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
  const raw = `${err.message ?? ""} ${err.error_user_msg ?? ""}`.toLowerCase();
  if (raw.includes("platform app")) {
    return "Esta conexão pertence ao app anterior da Meta. Vá em Conexões e conecte a conta novamente.";
  }
  if (raw.includes("developer role") || raw.includes("função de desenvolvedor")) {
    return "O app da Meta ainda está em modo de desenvolvimento: só contas com papel de administrador, desenvolvedor ou testador podem conectar. Adicione esta conta do Instagram como testadora no app (e aceite o convite pelo Instagram), ou coloque o app em modo ativo.";
  }
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

export function buildAuthorizationUrl(env: MetaEnv, scopes: string[], state?: string) {
  const redirectUri = env.redirectUri!;
  const params = new URLSearchParams({
    client_id: env.appId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(","),
  });
  if (state) params.set("state", state);
  // Log seguro: apenas a redirect_uri (sem code, token ou secret).
  console.info("[oauth] authorize redirect_uri:", redirectUri);
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForAccount(code: string, userId: string) {
  const env = readMetaEnv();
  if (!env.appId || !env.appSecret || !env.redirectUri) {
    throw new Error("Credenciais da Meta não configuradas no servidor.");
  }

  // Log seguro: apenas a redirect_uri (sem code, token ou secret).
  console.info("[oauth] token exchange redirect_uri:", env.redirectUri);
  await writeLog(userId, "oauth", "info", `Troca de código usando redirect_uri: ${env.redirectUri}`);

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
        user_id: userId,
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
      { onConflict: "user_id,instagram_user_id" },
    )
    .select("id, username")
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("account_tokens")
    .upsert({ account_id: account.id, access_token: token, user_id: userId }, { onConflict: "account_id" });

  await writeLog(userId, "oauth", "success", `Conta @${account.username} conectada com sucesso.`, {
    account_id: account.id,
  });

  return account;
}

/** Manual connection: validates a user-supplied token against the official Graph API. */
export async function connectWithAccessToken(rawToken: string, userId: string) {
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
        user_id: userId,
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
      { onConflict: "user_id,instagram_user_id" },
    )
    .select("id, username")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("account_tokens")
    .upsert({ account_id: account.id, access_token: token, user_id: userId }, { onConflict: "account_id" });

  await writeLog(userId, "token", "success", `Conta @${account.username} conectada por token manual.`, {
    account_id: account.id,
  });

  return { id: account.id, username: account.username };
}

export async function tokenFor(accountId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("account_tokens")
    .select("access_token")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token) throw new Error("Conta sem token válido. Reconecte a conta.");
  return data.access_token;
}

export async function syncAccountById(accountId: string, userId: string) {
  const env = readMetaEnv();
  const token = await tokenFor(accountId, userId);
  {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("instagram_accounts")
      .select("platform")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (row?.platform === "threads") {
      const { syncThreadsAccount } = await import("./threads.server");
      return syncThreadsAccount(accountId, userId, token);
    }
  }
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
    .eq("id", accountId)
    .eq("user_id", userId);
  await writeLog(userId, "sync", "info", `Conta sincronizada (@${me["username"]}).`, { accountId });
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

/** Marker for failures that should be retried on the next scheduler run. */
const RETRY_MARK = "__RETRY__";

// ---------------------------------------------------------------------------
// Pipeline de publicação: tentativas, retry progressivo e idempotência.
// ---------------------------------------------------------------------------

/** Máximo de tentativas de publicação antes de marcar falha definitiva. */
export const MAX_PUBLISH_ATTEMPTS = 4;
/** Espera progressiva (min) após as tentativas 1, 2 e 3. */
const RETRY_BACKOFF_MINUTES = [2, 10, 30];
/** Post em `publishing` por mais tempo que isso é considerado travado. */
const PUBLISHING_STALE_MS = 2 * 60 * 1000;

let pipelineColumnsAvailable: boolean | null = null;

/** Detecta (uma vez) se o banco já recebeu as colunas do pipeline de publicação. */
export async function publishPipelineEnabled(): Promise<boolean> {
  if (pipelineColumnsAvailable !== null) return pipelineColumnsAvailable;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("posts").select("attempt_count, next_retry_at").limit(1);
    pipelineColumnsAvailable = !error;
  } catch {
    pipelineColumnsAvailable = false;
  }
  if (!pipelineColumnsAvailable) {
    console.warn("[publish] Colunas de pipeline ausentes em posts — aplique a migration de publish pipeline.");
  }
  return pipelineColumnsAvailable;
}

export type PublishClaim = { ok: boolean; attempt: number; pipeline: boolean };

/**
 * Claim atômico de um post para publicação. Apenas um worker vence; o perdedor
 * recebe ok=false e não publica (impede cron A e cron B de publicarem o mesmo
 * post em paralelo, e também o clique duplo no botão).
 *
 * Com o pipeline no banco, usa a função SQL claim_post_for_publish, que faz a
 * transição e o incremento de attempt_count numa única instrução atômica.
 * Sem a migration aplicada, degrada para um claim condicional simples.
 */
async function claimPostForPublish(
  postId: string,
  ownerId: string,
  allowed: readonly string[],
): Promise<PublishClaim> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pipeline = await publishPipelineEnabled();

  if (pipeline) {
    const res = await supabaseAdmin.rpc("claim_post_for_publish", {
      p_post_id: postId,
      p_owner_id: ownerId,
      p_statuses: [...allowed],
    });
    if (!res.error) {
      const row = (res.data ?? [])[0];
      return row?.claimed
        ? { ok: true, attempt: row.attempt_count, pipeline: true }
        : { ok: false, attempt: 0, pipeline: true };
    }
    console.error("[publish] claim via RPC falhou; usando claim simples", res.error.message);
  }

  const { data } = await supabaseAdmin
    .from("posts")
    .update({ status: POST_STATUS_PUBLISHING, error_message: null })
    .eq("id", postId)
    .eq("user_id", ownerId)
    .in("status", [...allowed])
    .select("id")
    .maybeSingle();
  return data ? { ok: true, attempt: 1, pipeline: false } : { ok: false, attempt: 0, pipeline: false };
}

/** Erros que merecem nova tentativa em vez de virar FAILED na hora. */
function isTransientPublishError(rawMessage: string): boolean {
  return (
    rawMessage.startsWith(RETRY_MARK) ||
    /not ready|not available|ainda processando|still processing|fetch failed|timeout|indispon|temporarily|ECONN|ETIMEDOUT/i.test(
      rawMessage,
    )
  );
}

async function waitForContainer(containerId: string, token: string, version: string, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const json = await graph(
      `https://graph.instagram.com/${version}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const status = String(json["status_code"] ?? "");
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`A Meta não conseguiu processar a mídia (${String(json["status"] ?? status)}).`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`${RETRY_MARK}Ainda processando a mídia na Meta; vamos tentar de novo em instantes.`);
}


/** Marca falha definitiva, limpando os campos de retry quando o pipeline existe. */
async function finalizePostFailure(postId: string, ownerId: string, pipeline: boolean, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const extra = pipeline ? { next_retry_at: null, processing_started_at: null } : {};
  await supabaseAdmin
    .from("posts")
    .update({ status: POST_STATUS_FAILED, error_message: message, ...extra })
    .eq("id", postId)
    .eq("user_id", ownerId);
}

/**
 * Agenda retry progressivo (2, 10, 30 min). Devolve true se agendou; false se
 * as tentativas acabaram (o chamador deve marcar falha definitiva).
 */
async function schedulePostRetry(postId: string, ownerId: string, attempt: number, message: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (attempt >= MAX_PUBLISH_ATTEMPTS) return false;
  const minutes =
    RETRY_BACKOFF_MINUTES[Math.min(attempt, RETRY_BACKOFF_MINUTES.length) - 1] ??
    RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1]!;
  await supabaseAdmin
    .from("posts")
    .update({
      status: POST_STATUS_RETRYING,
      error_message: message,
      next_retry_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      processing_started_at: null,
    })
    .eq("id", postId)
    .eq("user_id", ownerId);
  return true;
}

/**
 * Decide o destino de um post após falha na tentativa de publicação:
 * - erro temporário + tentativas restantes -> retrying com retry progressivo;
 * - migration ainda não aplicada          -> comportamento legado (reenfileira);
 * - erro definitivo (ou tentativas no fim)-> failed + relança para a UI ver.
 */
async function handlePublishAttemptError(postId: string, ownerId: string, claim: PublishClaim, e: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const raw = e instanceof Error ? e.message : "Falha desconhecida ao publicar.";
  const message = raw.replace(RETRY_MARK, "").trim() || "Falha ao publicar.";
  const transient = isTransientPublishError(raw);

  if (transient && !claim.pipeline) {
    // Migration pendente: mantém o comportamento anterior (reenfileira para o próximo ciclo).
    await supabaseAdmin
      .from("posts")
      .update({ status: POST_STATUS_SCHEDULED, error_message: null })
      .eq("id", postId)
      .eq("user_id", ownerId);
    await writeLog(ownerId, "publish", "warn", message, { postId });
    return { ok: false as const, skipped: true as const, retry: true as const };
  }

  if (transient && (await schedulePostRetry(postId, ownerId, claim.attempt, message))) {
    await writeLog(
      ownerId,
      "publish",
      "warn",
      `Tentativa ${claim.attempt} falhou (temporário). Nova tentativa agendada.`,
      { postId, message },
    );
    return { ok: false as const, skipped: true as const, retry: true as const };
  }

  await finalizePostFailure(postId, ownerId, claim.pipeline, message);
  await writeLog(ownerId, "publish", "error", message, { postId, attempt: claim.attempt });
  throw new Error(message);
}

export async function publishPostById(postId: string, userId?: string) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: post } = await supabaseAdmin.from("posts").select("*").eq("id", postId).match(userId ? { user_id: userId } : {}).single();
  if (!post) throw new Error("Post não encontrado.");
  const ownerId = post.user_id;

  // Lock idempotente: se outra execução (cron concorrente ou clique duplo) já
  // assumiu esta publicação, sai sem publicar de novo — nunca dois workers
  // publicam o mesmo post ao mesmo tempo.
  const claim = await claimPostForPublish(postId, ownerId, MANUAL_PUBLISH_CLAIMABLE);
  if (!claim.ok) {
    return { ok: false as const, skipped: true as const, retry: false as const };
  }

  /** Falhas de pré-checagem precisam marcar o post, senão ele trava a fila para sempre. */
  const abort = async (message: string) => {
    await finalizePostFailure(postId, ownerId, claim.pipeline, message);
    await writeLog(ownerId, "publish", "error", message, { postId });
    throw new Error(message);
  };

  if (!post.account_id) await abort("A conta desta publicação foi removida do app. Selecione outra conta.");
  const accountId = post.account_id!;

  const { data: account } = await supabaseAdmin
    .from("instagram_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!account) await abort("Conta não encontrada ou removida do app.");

  if (account!.platform === "threads") {
    await supabaseAdmin.from("posts").update({ status: "publishing", error_message: null }).eq("id", postId).eq("user_id", ownerId);
    try {
      const token = await tokenFor(accountId, ownerId);
      const { publishThreadsPost } = await import("./threads.server");
      const result = await publishThreadsPost(post, account!.instagram_user_id, token);
      if (result.retry) {
        await supabaseAdmin
          .from("posts")
          .update({ status: "scheduled", meta_container_id: result.containerId, error_message: null })
          .eq("id", postId);
        await writeLog(ownerId, "publish", "warn", "Mídia ainda processando no Threads; nova tentativa em instantes.", { postId });
        throw new Error("Mídia ainda processando no Threads; vamos tentar de novo em instantes.");
      }
      await supabaseAdmin
        .from("posts")
        .update({
          status: "published",
          meta_container_id: result.containerId,
          meta_media_id: result.mediaId,
          published_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", postId);
      await writeLog(ownerId, "publish", "success", "Publicado no Threads com sucesso.", { postId, mediaId: result.mediaId });
      return { ok: true, mediaId: result.mediaId ?? "" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao publicar no Threads.";
      const { data: current } = await supabaseAdmin.from("posts").select("status").eq("id", postId).maybeSingle();
      if (current?.status !== "scheduled") {
        await supabaseAdmin.from("posts").update({ status: "failed", error_message: message }).eq("id", postId);
        await writeLog(ownerId, "publish", "error", message, { postId });
      }
      throw new Error(message);
    }
  }

  if (!(account!.scopes ?? []).includes("instagram_business_content_publish")) {
    await abort(
      "Esta conta não tem a permissão instagram_business_content_publish aprovada. Reconecte concedendo a permissão.",
    );
  }
  if (account!.account_type && !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(account!.account_type)) {
    await abort("Publicação só é permitida em contas Instagram Business ou Creator.");
  }

  await supabaseAdmin.from("posts").update({ status: "publishing", error_message: null }).eq("id", postId).eq("user_id", ownerId);

  try {
    const token = await tokenFor(accountId, ownerId);
    const igId = account!.instagram_user_id;

    const caption = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");
    let containerId: string;

    if (post.meta_container_id) {
      // Retomada: o container já foi criado numa execução anterior.
      containerId = post.meta_container_id;
      await waitForContainer(containerId, token, env.graphVersion);
    } else if (post.type === "CAROUSEL") {
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
        await waitForContainer(child, token, env.graphVersion);
        children.push(child);
      }
      containerId = await createContainer(igId, token, env.graphVersion, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      });
      await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);
      await waitForContainer(containerId, token, env.graphVersion);
    } else {
      const url = post.media_url ?? "";
      if (!isPublicHttpUrl(url))
        throw new Error("Informe uma URL pública e direta da mídia (a Meta precisa baixá-la).");
      if (post.type === "REEL") {
        const cover = (post as { cover_url?: string | null }).cover_url ?? "";
        if (cover && !isPublicHttpUrl(cover))
          throw new Error("A capa do Reel precisa de uma URL pública e direta.");
        containerId = await createContainer(igId, token, env.graphVersion, {
          media_type: "REELS",
          video_url: url,
          caption,
          ...(cover ? { cover_url: cover } : {}),
        });
        // Guarda o container antes de esperar: se o tempo acabar, a próxima execução retoma daqui.
        await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);
        await waitForContainer(containerId, token, env.graphVersion);
      } else if (post.type === "STORY") {
        // Story oficial: media_type=STORIES com image_url ou video_url.
        // A API do Instagram Login não aceita user_tags nem legenda em Stories.
        const isVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(url);
        containerId = await createContainer(igId, token, env.graphVersion, {
          media_type: "STORIES",
          ...(isVideo ? { video_url: url } : { image_url: url }),
        });
        await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);
        await waitForContainer(containerId, token, env.graphVersion);
      } else {
        containerId = await createContainer(igId, token, env.graphVersion, {
          image_url: url,
          caption,
        });
        await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);
        await waitForContainer(containerId, token, env.graphVersion);
      }
    }

    await supabaseAdmin.from("posts").update({ meta_container_id: containerId }).eq("id", postId);

    let published: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        published = await graph(`https://graph.instagram.com/${env.graphVersion}/${igId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ creation_id: containerId, access_token: token }),
        });
        break;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const notReady = /not ready|not available|processing/i.test(message);
        if (!notReady || attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
    if (!published) throw new Error("Falha ao publicar a mídia.");

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

    await writeLog(ownerId, "publish", "success", `Publicado com sucesso (${post.type}).`, {
      postId,
      mediaId,
      containerId,
    });
    return { ok: true, mediaId };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Falha desconhecida ao publicar.";
    const retriable = raw.startsWith(RETRY_MARK);
    const message = raw.replace(RETRY_MARK, "");
    await supabaseAdmin
      .from("posts")
      .update({
        status: retriable ? "scheduled" : "failed",
        error_message: retriable ? null : message,
      })
      .eq("id", postId);
    await writeLog(ownerId, "publish", retriable ? "warn" : "error", message, { postId });
    throw new Error(message);
  }
}

export async function publishPendingNow(userId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Recupera posts travados em "publicando" (execução interrompida por timeout).
  const ownerFilter = userId ? { user_id: userId } : {};
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("posts")
    .update({ status: "scheduled" })
    .eq("status", "publishing")
    .match(ownerFilter)
    .lt("updated_at", staleCutoff);

  // Posts sem conta (conta removida) nunca podem ser publicados: marca como falha
  // para que não ocupem a fila indefinidamente.
  await supabaseAdmin
    .from("posts")
    .update({
      status: "failed",
      error_message: "A conta desta publicação foi removida do app.",
    })
    .eq("status", "scheduled")
    .match(ownerFilter)
    .is("account_id", null);

  const { data: pending } = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("status", "scheduled")
    .match(ownerFilter)
    .not("account_id", "is", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);


  const startedAt = Date.now();
  const BUDGET_MS = 50_000;
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of pending ?? []) {
    if (Date.now() - startedAt > BUDGET_MS) {
      skipped++;
      continue;
    }
    try {
      await publishPostById(p.id, userId);
      ok++;
    } catch {
      failed++;
    }
  }
  if (userId) await writeLog(
    userId,
    "scheduler",
    "info",
    `Publicação de pendentes executada: ${ok} ok, ${failed} falhas, ${skipped} adiados.`,
  );
  return { ok, failed, skipped, total: (pending ?? []).length };
}

/** Soma de views num intervalo (janela em dias) usando a métrica oficial `views`. */
async function viewsInWindow(env: ReturnType<typeof readMetaEnv>, token: string, days: number) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const res = await graph(
    `https://graph.instagram.com/${env.graphVersion}/me/insights?metric=views&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
  );
  const arr = (res["data"] as { total_value?: { value?: number } }[] | undefined) ?? [];
  const value = arr.find((metric) => typeof metric.total_value?.value === "number")?.total_value?.value;
  return typeof value === "number" ? value : null;
}

// Implementações legadas de leitura ao vivo (substituídas pelas versões que
// leem o banco de métricas oficiais). Mantidas apenas para não quebrar histórico.
async function legacyFetchAccountsInsights(userId: string) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .eq("status", "connected");

  const results: {
    accountId: string;
    username: string;
    followers: number | null;
    mediaCount: number | null;
    views: number | null;
    views7d: number | null;
    views30d: number | null;
    error?: string;
  }[] = [];

  for (const acc of accounts ?? []) {
    try {
      const token = await tokenFor(acc.id, userId);
      const me = await graph(
        `https://graph.instagram.com/${env.graphVersion}/me?fields=followers_count,media_count&access_token=${encodeURIComponent(token)}`,
      );
      let insightsError: string | undefined;
      const [d1, d7, d30] = await Promise.all(
        [1, 7, 30].map(async (d) => {
          try {
            return await viewsInWindow(env, token, d);
          } catch (e) {
            if (!insightsError) insightsError = e instanceof Error ? e.message : "Métrica de views indisponível.";
            return null;
          }
        }),
      );
      if (d1 === null && d7 === null && d30 === null && !insightsError) {
        insightsError = "A API não retornou views para esta conta.";
      }
      results.push({
        accountId: acc.id,
        username: acc.username,
        followers: (me["followers_count"] as number) ?? null,
        mediaCount: (me["media_count"] as number) ?? null,
        views: d1 ?? null,
        views7d: d7 ?? null,
        views30d: d30 ?? null,
        ...(insightsError ? { error: insightsError } : {}),
      });
    } catch (e) {
      results.push({
        accountId: acc.id,
        username: acc.username,
        followers: null,
        mediaCount: null,
        views: null,
        views7d: null,
        views30d: null,
        error: e instanceof Error ? e.message : "Indisponível",
      });
    }
  }
  return results;
}


async function legacyFetchInsightsTimeseries(userId: string, days = 30) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .eq("status", "connected");

  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;

  const viewsByDay = new Map<string, number>();
  const gainsByDay = new Map<string, number>();
  let followersNow = 0;
  let available = false;

  for (const acc of accounts ?? []) {
    try {
      const token = await tokenFor(acc.id, userId);
      const me = await graph(
        `https://graph.instagram.com/${env.graphVersion}/me?fields=followers_count&access_token=${encodeURIComponent(token)}`,
      );
      followersNow += (me["followers_count"] as number) ?? 0;

      type MetricRow = { name?: string; values?: { value?: number; end_time?: string }[] };

      const collect = (rows: MetricRow[]) => {
        for (const metric of rows) {
          const target =
            metric.name === "views" ? viewsByDay : metric.name === "follower_count" ? gainsByDay : null;
          if (!target) continue;
          for (const v of metric.values ?? []) {
            if (!v.end_time) continue;
            const day = v.end_time.slice(0, 10);
            target.set(day, (target.get(day) ?? 0) + (v.value ?? 0));
            available = true;
          }
        }
      };

      // "views" com metric_type=time_series costuma vir vazio nesta API.
      // Fallback oficial: consulta total_value dia a dia (janelas de 24h).
      let gotSeries = false;
      try {
        const viewsSeries = await graph(
          `https://graph.instagram.com/${env.graphVersion}/me/insights?metric=views&period=day&metric_type=time_series&since=${since}&until=${now}&access_token=${encodeURIComponent(token)}`,
        );
        const rows = (viewsSeries["data"] as MetricRow[] | undefined) ?? [];
        gotSeries = rows.some((r) => (r.values ?? []).length > 0);
        collect(rows);
      } catch {
        // métrica de views indisponível para a conta
      }

      if (!gotSeries) {
        const dayEnds: number[] = [];
        const todayEnd = Math.floor(Date.now() / 1000);
        for (let i = 0; i < days; i++) dayEnds.push(todayEnd - i * 86400);
        const daily = await Promise.all(
          dayEnds.map(async (end) => {
            try {
              const res = await graph(
                `https://graph.instagram.com/${env.graphVersion}/me/insights?metric=views&period=day&metric_type=total_value&since=${end - 86400}&until=${end}&access_token=${encodeURIComponent(token)}`,
              );
              const arr = (res["data"] as { total_value?: { value?: number } }[] | undefined) ?? [];
              const value = arr.find((m) => typeof m.total_value?.value === "number")?.total_value?.value;
              return { end, value: typeof value === "number" ? value : null };
            } catch {
              return { end, value: null };
            }
          }),
        );
        for (const d of daily) {
          if (d.value === null) continue;
          const day = new Date(d.end * 1000).toISOString().slice(0, 10);
          viewsByDay.set(day, (viewsByDay.get(day) ?? 0) + d.value);
          available = true;
        }
      }


      try {
        const followerSeries = await graph(
          `https://graph.instagram.com/${env.graphVersion}/me/insights?metric=follower_count&period=day&since=${since}&until=${now}&access_token=${encodeURIComponent(token)}`,
        );
        collect((followerSeries["data"] as MetricRow[] | undefined) ?? []);
      } catch {
        // conta sem histórico de seguidores
      }
    } catch {
      // conta sem permissão de insights: ignora
    }
  }

  const dayKeys = Array.from(new Set([...viewsByDay.keys(), ...gainsByDay.keys()])).sort();

  // Reconstrói o total de seguidores retroativamente a partir do total atual.
  const followersByDay = new Map<string, number>();
  let running = followersNow;
  for (let i = dayKeys.length - 1; i >= 0; i--) {
    const key = dayKeys[i]!;
    followersByDay.set(key, running);
    running -= gainsByDay.get(key) ?? 0;
  }

  return {
    available,
    points: dayKeys.map((day) => ({
      day,
      views: viewsByDay.get(day) ?? 0,
      followers: followersByDay.get(day) ?? followersNow,
    })),
  };
}

export type PostMetric = {
  id: string;
  accountId: string;
  username: string;
  caption: string;
  mediaType: string;
  thumbnail: string | null;
  permalink: string | null;
  timestamp: string;
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  reach: number | null;
};

/** Métricas por publicação (views, curtidas, compartilhamentos) dos últimos N dias. */
async function legacyFetchPostsMetrics(userId: string, days = 30) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .eq("status", "connected");

  const cutoff = Date.now() - days * 86400_000;
  const posts: PostMetric[] = [];
  const errors: string[] = [];

  for (const acc of accounts ?? []) {
    try {
      const token = await tokenFor(acc.id, userId);
      const res = await graph(
        `https://graph.instagram.com/${env.graphVersion}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${encodeURIComponent(token)}`,
      );
      const media = (res["data"] as Record<string, unknown>[] | undefined) ?? [];
      const recent = media.filter((m) => {
        const ts = typeof m["timestamp"] === "string" ? Date.parse(m["timestamp"]) : NaN;
        return Number.isFinite(ts) && ts >= cutoff;
      });

      for (const m of recent) {
        const id = String(m["id"]);
        let views: number | null = null;
        let shares: number | null = null;
        let reach: number | null = null;
        try {
          const ins = await graph(
            `https://graph.instagram.com/${env.graphVersion}/${id}/insights?metric=views,shares,reach&access_token=${encodeURIComponent(token)}`,
          );
          for (const row of ((ins["data"] as Record<string, unknown>[] | undefined) ?? [])) {
            const name = String(row["name"] ?? "");
            const values = (row["values"] as { value?: number }[] | undefined) ?? [];
            const value = typeof values[0]?.value === "number" ? values[0]!.value! : null;
            if (name === "views") views = value;
            if (name === "shares") shares = value;
            if (name === "reach") reach = value;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Insights indisponíveis.";
          if (!errors.includes(msg)) errors.push(msg);
        }

        posts.push({
          id,
          accountId: acc.id,
          username: acc.username,
          caption: typeof m["caption"] === "string" ? (m["caption"] as string) : "",
          mediaType: String(m["media_type"] ?? "IMAGE"),
          thumbnail: (m["thumbnail_url"] as string) ?? (m["media_url"] as string) ?? null,
          permalink: (m["permalink"] as string) ?? null,
          timestamp: String(m["timestamp"] ?? ""),
          views,
          likes: typeof m["like_count"] === "number" ? (m["like_count"] as number) : null,
          shares,
          comments: typeof m["comments_count"] === "number" ? (m["comments_count"] as number) : null,
          reach,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Conta indisponível.";
      if (!errors.includes(msg)) errors.push(msg);
    }
  }

  posts.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const byDay = new Map<string, { views: number; likes: number; shares: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    byDay.set(day, { views: 0, likes: 0, shares: 0 });
  }
  for (const p of posts) {
    const day = p.timestamp.slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.views += p.views ?? 0;
    bucket.likes += p.likes ?? 0;
    bucket.shares += p.shares ?? 0;
  }

  return {
    posts,
    series: Array.from(byDay.entries()).map(([day, v]) => ({ day, ...v })),
    totals: {
      views: posts.reduce((a, p) => a + (p.views ?? 0), 0),
      likes: posts.reduce((a, p) => a + (p.likes ?? 0), 0),
      shares: posts.reduce((a, p) => a + (p.shares ?? 0), 0),
      comments: posts.reduce((a, p) => a + (p.comments ?? 0), 0),
    },
    errors,
  };
}

// ===========================================================================
// Leituras de métricas 100% a partir dos dados oficiais coletados no banco.
// Nenhuma chamada direta à API da Meta acontece aqui: exibimos exatamente o
// que o coletor gravou na última sincronização oficial (ig_media e
// account_daily_metrics). Dado ausente continua ausente — nunca vira zero.
// ===========================================================================

export type DailyMetricRow = {
  account_id: string;
  day: string;
  followers: number | null;
  views: number | null;
  reach: number | null;
  profile_views: number | null;
};

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Contas conectadas de uma plataforma (leitura pura do banco). */
export async function accountsForPlatform(userId: string, platform: "instagram" | "threads") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username, platform, profile_picture_url, account_type, last_sync_at, status")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("status", "connected")
    .order("created_at", { ascending: true });
  return (data ?? []) as {
    id: string;
    username: string;
    platform: string;
    profile_picture_url: string | null;
    account_type: string | null;
    last_sync_at: string | null;
    status: string;
  }[];
}

/** Linhas diárias (oficiais) de métricas de conta a partir de `fromDay` (inclusive). */
export async function dailyMetricRows(
  userId: string,
  accountIds: string[],
  fromDay?: string,
): Promise<DailyMetricRow[]> {
  if (accountIds.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("account_daily_metrics")
    .select("account_id, day, followers, views, reach, profile_views")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .order("day", { ascending: false });
  if (fromDay) query = query.gte("day", fromDay);
  const { data } = await query;
  return (data ?? []) as DailyMetricRow[];
}

/**
 * Soma oficial de uma métrica de conta em janelas de dias *completos* (ontem
 * para trás). Devolve também quantos dias da janela tinham dado real, para a
 * interface nunca tratar ausência como zero.
 */
export function aggregateDailyWindow(
  rows: DailyMetricRow[],
  accountId: string,
  metric: "views" | "reach" | "profile_views",
  days: number,
): { value: number | null; daysAvailable: number; daysExpected: number } {
  const today = todayUtc();
  const from = shiftDay(today, -days);
  const lastComplete = shiftDay(today, -1);
  const mine = rows.filter(
    (r) => r.account_id === accountId && r.day >= from && r.day <= lastComplete,
  );
  let sum = 0;
  let available = 0;
  for (const row of mine) {
    const v = row[metric];
    if (typeof v === "number") {
      sum += v;
      available++;
    }
  }
  return { value: available ? sum : null, daysAvailable: available, daysExpected: days };
}

/** Seguidores: último valor oficial coletado (dia mais recente que tiver dado). */
export function latestFollowers(rows: DailyMetricRow[], accountId: string): number | null {
  for (const row of rows) {
    if (row.account_id === accountId && typeof row.followers === "number") return row.followers;
  }
  return null;
}

/** Série diária (views + seguidores) somada por dia entre as contas da plataforma. */
export async function readDailySeries(userId: string, platform: "instagram" | "threads", days: number) {
  const accounts = await accountsForPlatform(userId, platform);
  const rows = await dailyMetricRows(userId, accounts.map((a) => a.id), shiftDay(todayUtc(), -days));
  const byDay = new Map<string, { views: number; followers: number | null; day: string }>();
  let available = false;
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, views: 0, followers: null as number | null };
    if (typeof row.views === "number") {
      entry.views += row.views;
      available = true;
    }
    if (typeof row.followers === "number") {
      entry.followers = entry.followers === null ? row.followers : Math.max(entry.followers, row.followers);
    }
    byDay.set(row.day, entry);
  }
  return {
    available,
    points: Array.from(byDay.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((p) => ({ day: p.day, views: p.views, followers: p.followers })),
  };
}

const NO_DATA_MESSAGE =
  "Nenhuma métrica coletada ainda. Use o botão Sincronizar agora para buscar os dados oficiais da conta.";

type AccountInsightRow = {
  accountId: string;
  username: string;
  followers: number | null;
  mediaCount: number | null;
  views: number | null;
  views7d: number | null;
  views30d: number | null;
  reach7d: number | null;
  error?: string;
};

/** Resumo por conta do Instagram a partir dos dados oficiais armazenados. */
export async function fetchAccountsInsights(userId: string): Promise<AccountInsightRow[]> {
  const accounts = await accountsForPlatform(userId, "instagram");
  const rows = await dailyMetricRows(userId, accounts.map((a) => a.id));
  return accounts.map((acc) => {
    const w1 = aggregateDailyWindow(rows, acc.id, "views", 1);
    const w7 = aggregateDailyWindow(rows, acc.id, "views", 7);
    const w30 = aggregateDailyWindow(rows, acc.id, "views", 30);
    const reach7 = aggregateDailyWindow(rows, acc.id, "reach", 7);
    const followers = latestFollowers(rows, acc.id);
    const row: AccountInsightRow = {
      accountId: acc.id,
      username: acc.username,
      followers,
      mediaCount: null,
      views: w1.value,
      views7d: w7.value,
      views30d: w30.value,
      reach7d: reach7.value,
    };
    if (followers === null && w30.daysAvailable === 0 && w7.daysAvailable === 0) {
      row.error = NO_DATA_MESSAGE;
    }
    return row;
  });
}

/** Série diária oficial de views e seguidores (Instagram) para o gráfico do painel. */
export async function fetchInsightsTimeseries(userId: string, days = 30) {
  return readDailySeries(userId, "instagram", days);
}

export type PostMetric = {
  id: string;
  accountId: string;
  username: string;
  caption: string;
  mediaType: string;
  thumbnail: string | null;
  permalink: string | null;
  timestamp: string;
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  reach: number | null;
};

type StoredMediaRow = {
  id: string;
  account_id: string;
  caption: string | null;
  media_type: string | null;
  format: string;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  reach: number | null;
};

/** Mídias oficiais armazenadas de uma plataforma publicadas nos últimos N dias. */
export async function storedMediaRows(
  userId: string,
  platform: "instagram" | "threads",
  days: number,
): Promise<{ posts: PostMetric[]; errors: string[] }> {
  const accounts = await accountsForPlatform(userId, platform);
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return { posts: [], errors: [] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("ig_media")
    .select(
      "id, account_id, caption, media_type, format, thumbnail_url, permalink, published_at, views, likes, shares, comments, reach",
    )
    .eq("user_id", userId)
    .in("account_id", ids)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false });
  const byUsername = new Map(accounts.map((a) => [a.id, a.username]));
  const posts = ((data ?? []) as StoredMediaRow[]).map((m) => ({
    id: m.id,
    accountId: m.account_id,
    username: byUsername.get(m.account_id) ?? "conta",
    caption: m.caption ?? "",
    mediaType: m.media_type ?? m.format,
    thumbnail: m.thumbnail_url,
    permalink: m.permalink,
    timestamp: m.published_at ?? "",
    views: m.views,
    likes: m.likes,
    shares: m.shares,
    comments: m.comments,
    reach: m.reach,
  }));
  return { posts, errors: [] };
}

function sumPresent(posts: PostMetric[], key: "views" | "likes" | "shares" | "comments" | "reach") {
  const values = posts.filter((p) => p[key] !== null && p[key] !== undefined);
  if (values.length === 0) return null;
  return values.reduce((acc, p) => acc + (p[key] as number), 0);
}

/** Métricas por publicação do Instagram a partir dos dados oficiais armazenados. */
export async function fetchPostsMetrics(userId: string, days = 30) {
  const { posts, errors } = await storedMediaRows(userId, "instagram", days);
  const byDay = new Map<string, { day: string; views: number | null; likes: number | null; shares: number | null }>();
  for (const p of posts) {
    const day = p.timestamp.slice(0, 10);
    const bucket = byDay.get(day) ?? { day, views: null, likes: null, shares: null };
    bucket.views = bucket.views === null && p.views === null ? null : (bucket.views ?? 0) + (p.views ?? 0);
    bucket.likes = bucket.likes === null && p.likes === null ? null : (bucket.likes ?? 0) + (p.likes ?? 0);
    bucket.shares = bucket.shares === null && p.shares === null ? null : (bucket.shares ?? 0) + (p.shares ?? 0);
    byDay.set(day, bucket);
  }
  return {
    posts,
    series: Array.from(byDay.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    totals: {
      views: sumPresent(posts, "views"),
      likes: sumPresent(posts, "likes"),
      shares: sumPresent(posts, "shares"),
      comments: sumPresent(posts, "comments"),
      reach: sumPresent(posts, "reach"),
    },
    errors,
  };
}



