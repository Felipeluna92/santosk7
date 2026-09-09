import type { LooseTable } from "@/lib/db-loose";
// Server-only helpers for the official Threads API (graph.threads.net).
// Never import this from client code.

import { tokenFor, writeLog, todayUtc, dailyMetricRows, aggregateDailyWindow, latestFollowers, storedMediaRows, shiftDay } from "./meta.server";

const THREADS_API = "https://graph.threads.net/v1.0";

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

/** URL de callback oficial de produção do Threads. Cadastre IGUAL no painel da Meta. */
export const THREADS_PRODUCTION_REDIRECT_URI =
  "https://santosk7.lovable.app/api/public/oauth/threads/callback";

export type ThreadsEnv = {
  appId: string | null;
  appSecret: string | null;
  redirectUri: string;
};

export function readThreadsEnv(): ThreadsEnv {
  return {
    appId: process.env["THREADS_APP_ID"] ?? null,
    appSecret: process.env["THREADS_APP_SECRET"] ?? null,
    redirectUri: process.env["THREADS_REDIRECT_URI"] ?? THREADS_PRODUCTION_REDIRECT_URI,
  };
}

export function buildThreadsAuthorizationUrl(env: ThreadsEnv, state: string) {
  const params = new URLSearchParams({
    client_id: env.appId!,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: THREADS_SCOPES.join(","),
    state,
  });
  console.info("[threads-oauth] authorize redirect_uri:", env.redirectUri);
  return `https://threads.net/oauth/authorize?${params.toString()}`;
}

function humanizeThreadsError(payload: unknown): string {
  const err = (payload as { error?: { message?: string; code?: number; error_user_msg?: string } })?.error;
  if (!err) return "Erro desconhecido ao falar com a API do Threads.";
  if (err.error_user_msg) return err.error_user_msg;
  const map: Record<number, string> = {
    190: "O token do Threads expirou ou foi revogado. Reconecte a conta.",
    10: "Sua conta ou app não tem permissão para essa ação no Threads.",
    100: "Parâmetro inválido enviado ao Threads. Verifique a URL da mídia e o tipo de post.",
    200: "Permissão insuficiente. O app precisa de threads_content_publish aprovado.",
  };
  return (err.code && map[err.code]) || err.message || "Erro na API do Threads.";
}

async function threads(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json["error"]) throw new Error(humanizeThreadsError(json));
  return json;
}

/** Salva (ou atualiza) a conta do Threads a partir de um token válido. */
async function saveThreadsAccount(
  token: string,
  expiresIn: number | null,
  userId: string,
  scopes: string[] = THREADS_SCOPES,
) {
  const me = await threads(
    `${THREADS_API}/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
  );

  const threadsUserId = String(me["id"] ?? "");
  if (!threadsUserId) throw new Error("Não foi possível identificar a conta do Threads com esse token.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account, error } = await supabaseAdmin
    .from("instagram_accounts")
    .upsert(
      {
        user_id: userId,
        platform: "threads",
        instagram_user_id: threadsUserId,
        username: String(me["username"] ?? "conta"),
        display_name: (me["name"] as string) ?? null,
        profile_picture_url: (me["threads_profile_picture_url"] as string) ?? null,
        account_type: "THREADS",
        scopes,
        token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        last_sync_at: new Date().toISOString(),
        status: "connected",
      },
      { onConflict: "user_id,platform,instagram_user_id" },
    )
    .select("id, username")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("account_tokens")
    .upsert({ account_id: account.id, access_token: token, user_id: userId }, { onConflict: "account_id" });

  await writeLog(userId, "token", "success", `Conta @${account.username} conectada no Threads.`, {
    account_id: account.id,
  });

  return { id: account.id, username: account.username };
}

/** Conecta uma conta do Threads validando um token colado manualmente. */
export async function connectThreadsWithToken(rawToken: string, userId: string) {
  const input = rawToken.trim();
  if (input.length < 20) throw new Error("Token inválido. Cole o token de acesso completo do Threads.");

  let token = input;
  let expiresIn: number | null = null;
  const appSecret = process.env["THREADS_APP_SECRET"] ?? process.env["META_APP_SECRET"];

  if (appSecret) {
    try {
      const long = await threads(
        `${THREADS_API.replace("/v1.0", "")}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(
          appSecret,
        )}&access_token=${encodeURIComponent(token)}`,
      );
      if (long["access_token"]) token = String(long["access_token"]);
      expiresIn = Number(long["expires_in"] ?? 0) || null;
    } catch {
      // Pode já ser um token de longa duração; segue com o informado.
    }
  }

  return saveThreadsAccount(token, expiresIn, userId);
}

/** Fluxo OAuth oficial: troca o código pelo token e salva a conta. */
export async function exchangeThreadsCodeForAccount(code: string, userId: string) {
  const env = readThreadsEnv();
  if (!env.appId || !env.appSecret) {
    throw new Error("Credenciais do app do Threads não configuradas no servidor.");
  }

  console.info("[threads-oauth] token exchange redirect_uri:", env.redirectUri);
  await writeLog(userId, "oauth", "info", `Troca de código do Threads usando redirect_uri: ${env.redirectUri}`);

  const short = await threads("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.appId,
      client_secret: env.appSecret,
      grant_type: "authorization_code",
      redirect_uri: env.redirectUri,
      code,
    }),
  });

  let token = String(short["access_token"] ?? "");
  if (!token) throw new Error("O Threads não devolveu o token de acesso.");
  let expiresIn: number | null = null;

  try {
    const long = await threads(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(
        env.appSecret,
      )}&access_token=${encodeURIComponent(token)}`,
    );
    if (long["access_token"]) token = String(long["access_token"]);
    expiresIn = Number(long["expires_in"] ?? 0) || null;
  } catch {
    // Segue com o token de curta duração.
  }

  return saveThreadsAccount(token, expiresIn, userId);
}

export async function syncThreadsAccount(accountId: string, userId: string, token: string) {
  const me = await threads(
    `${THREADS_API}/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
  );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("instagram_accounts")
    .update({
      username: String(me["username"] ?? ""),
      display_name: (me["name"] as string) ?? null,
      profile_picture_url: (me["threads_profile_picture_url"] as string) ?? null,
      last_sync_at: new Date().toISOString(),
      status: "connected",
    })
    .eq("id", accountId)
    .eq("user_id", userId);
  await writeLog(userId, "sync", "info", `Conta do Threads sincronizada (@${me["username"]}).`, { accountId });
  return { ok: true };
}

async function waitForThreadsContainer(containerId: string, token: string, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const json = await threads(
      `${THREADS_API}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`,
    );
    const status = String(json["status"] ?? "");
    if (status === "FINISHED") return true;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`O Threads não conseguiu processar a mídia (${String(json["error_message"] ?? status)}).`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

type ThreadsPost = {
  id: string;
  type: string;
  caption: string | null;
  hashtags: string | null;
  media_url: string | null;
  carousel_urls?: string[] | null;
  meta_container_id: string | null;
};

const isVideoUrl = (url: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(url);

/**
 * Publica um post no Threads em duas etapas (container + publish).
 * Suporta texto puro, imagem, vídeo e carrossel (2 a 20 mídias).
 * O Threads não tem Reels nem Stories nesta API.
 */
export async function publishThreadsPost(post: ThreadsPost, threadsUserId: string, token: string) {
  const text = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");
  const url = (post.media_url ?? "").trim();
  const isVideo = isVideoUrl(url);
  const carousel = (post.carousel_urls ?? []).map((u) => (u ?? "").trim()).filter(Boolean);
  const isCarousel = post.type === "CAROUSEL" && carousel.length >= 2;

  if (isCarousel && carousel.length > 20) {
    throw new Error("O carrossel do Threads aceita no máximo 20 mídias.");
  }
  if (!text && !url && !isCarousel) {
    throw new Error("Escreva um texto ou anexe uma mídia para publicar no Threads.");
  }

  let containerId = post.meta_container_id ?? "";
  let needsWait = Boolean(url) || isCarousel;

  if (!containerId && isCarousel) {
    const children: string[] = [];
    for (const item of carousel) {
      const created = await threads(`${THREADS_API}/${threadsUserId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: isVideoUrl(item) ? "VIDEO" : "IMAGE",
          ...(isVideoUrl(item) ? { video_url: item } : { image_url: item }),
          is_carousel_item: "true",
          access_token: token,
        }),
      });
      const childId = String(created["id"] ?? "");
      if (!childId) throw new Error("O Threads não retornou o identificador de uma das mídias do carrossel.");
      await waitForThreadsContainer(childId, token);
      children.push(childId);
    }
    const parent = await threads(`${THREADS_API}/${threadsUserId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "CAROUSEL",
        children: children.join(","),
        ...(text ? { text } : {}),
        access_token: token,
      }),
    });
    containerId = String(parent["id"] ?? "");
    if (!containerId) throw new Error("O Threads não retornou o identificador do carrossel.");
  } else if (!containerId) {
    const body = new URLSearchParams({
      media_type: url ? (isVideo ? "VIDEO" : "IMAGE") : "TEXT",
      ...(text ? { text } : {}),
      ...(url ? (isVideo ? { video_url: url } : { image_url: url }) : {}),
      access_token: token,
    });
    const created = await threads(`${THREADS_API}/${threadsUserId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    containerId = String(created["id"] ?? "");
    if (!containerId) throw new Error("O Threads não retornou o identificador da publicação.");
    needsWait = Boolean(url);
  }

  if (needsWait) {
    const ready = await waitForThreadsContainer(containerId, token);
    if (!ready) return { containerId, mediaId: null as string | null, retry: true as const };
  }


  const published = await threads(`${THREADS_API}/${threadsUserId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });

  return { containerId, mediaId: String(published["id"] ?? ""), retry: false as const };
}

// ===================== Insights do Threads (separados do Instagram) =====================

async function threadsAccounts(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username, instagram_user_id")
    .eq("user_id", userId)
    .eq("platform", "threads")
    .eq("status", "connected");
  return data ?? [];
}

function metricValue(payload: Record<string, unknown>, name: string): number | null {
  const rows = (payload["data"] as Record<string, unknown>[] | undefined) ?? [];
  const row = rows.find((r) => String(r["name"] ?? "") === name);
  if (!row) return null;
  const total = (row["total_value"] as { value?: number } | undefined)?.value;
  if (typeof total === "number") return total;
  const values = (row["values"] as { value?: number }[] | undefined) ?? [];
  const sum = values.reduce((a, v) => a + (typeof v.value === "number" ? v.value : 0), 0);
  return values.length ? sum : null;
}

/** Resumo por conta do Threads: seguidores e views em 1, 7 e 30 dias. */
async function legacyFetchThreadsAccountsInsights(userId: string) {
  const { tokenFor } = await import("./meta.server");
  const accounts = await threadsAccounts(userId);
  const results: {
    accountId: string;
    username: string;
    followers: number | null;
    views: number | null;
    views7d: number | null;
    views30d: number | null;
    error?: string;
  }[] = [];

  for (const acc of accounts) {
    try {
      const token = await tokenFor(acc.id, userId);
      let error: string | undefined;
      const windows = await Promise.all(
        [1, 7, 30].map(async (d) => {
          try {
            const until = Math.floor(Date.now() / 1000);
            const since = until - d * 86400;
            const res = await threads(
              `${THREADS_API}/me/threads_insights?metric=views&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
            );
            return metricValue(res, "views");
          } catch (e) {
            if (!error) error = e instanceof Error ? e.message : "Métrica indisponível no Threads.";
            return null;
          }
        }),
      );
      let followers: number | null = null;
      try {
        const res = await threads(
          `${THREADS_API}/me/threads_insights?metric=followers_count&access_token=${encodeURIComponent(token)}`,
        );
        followers = metricValue(res, "followers_count");
      } catch {
        // conta sem métrica de seguidores
      }
      results.push({
        accountId: acc.id,
        username: acc.username,
        followers,
        views: windows[0] ?? null,
        views7d: windows[1] ?? null,
        views30d: windows[2] ?? null,
        ...(error ? { error } : {}),
      });
    } catch (e) {
      results.push({
        accountId: acc.id,
        username: acc.username,
        followers: null,
        views: null,
        views7d: null,
        views30d: null,
        error: e instanceof Error ? e.message : "Indisponível",
      });
    }
  }
  return results;
}

export type ThreadsPostMetric = {
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

/** Métricas por publicação do Threads nos últimos N dias. */
async function legacyFetchThreadsPostsMetrics(userId: string, days = 30) {
  const { tokenFor } = await import("./meta.server");
  const accounts = await threadsAccounts(userId);
  const cutoff = Date.now() - days * 86400_000;
  const posts: ThreadsPostMetric[] = [];
  const errors: string[] = [];

  for (const acc of accounts) {
    try {
      const token = await tokenFor(acc.id, userId);
      const res = await threads(
        `${THREADS_API}/me/threads?fields=id,text,media_type,media_url,thumbnail_url,permalink,timestamp&limit=50&access_token=${encodeURIComponent(token)}`,
      );
      const media = (res["data"] as Record<string, unknown>[] | undefined) ?? [];
      const recent = media.filter((m) => {
        const ts = typeof m["timestamp"] === "string" ? Date.parse(m["timestamp"] as string) : NaN;
        return Number.isFinite(ts) && ts >= cutoff;
      });

      for (const m of recent) {
        const id = String(m["id"]);
        let views: number | null = null;
        let likes: number | null = null;
        let comments: number | null = null;
        let shares: number | null = null;
        try {
          const ins = await threads(
            `${THREADS_API}/${id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(token)}`,
          );
          views = metricValue(ins, "views");
          likes = metricValue(ins, "likes");
          comments = metricValue(ins, "replies");
          const reposts = metricValue(ins, "reposts");
          const quotes = metricValue(ins, "quotes");
          shares = reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Insights do Threads indisponíveis.";
          if (!errors.includes(msg)) errors.push(msg);
        }

        posts.push({
          id,
          accountId: acc.id,
          username: acc.username,
          caption: typeof m["text"] === "string" ? (m["text"] as string) : "",
          mediaType: String(m["media_type"] ?? "TEXT"),
          thumbnail: (m["thumbnail_url"] as string) ?? (m["media_url"] as string) ?? null,
          permalink: (m["permalink"] as string) ?? null,
          timestamp: String(m["timestamp"] ?? ""),
          views,
          likes,
          shares,
          comments,
          reach: null,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Conta do Threads indisponível.";
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
    const bucket = byDay.get(p.timestamp.slice(0, 10));
    if (!bucket) continue;
    bucket.views += p.views ?? 0;
    bucket.likes += p.likes ?? 0;
    bucket.shares += p.shares ?? 0;
  }

  return {
    posts,
    series: Array.from(byDay.entries()).map(([day, v]) => ({ ...v, day })),
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
// Leituras de métricas do Threads a partir dos dados oficiais armazenados
// (mesma filosofia do Instagram: exibir só o que o coletor gravou do banco).
// ===========================================================================

const THREADS_NO_DATA =
  "Nenhuma métrica do Threads coletada ainda. Use Sincronizar agora para buscar os dados oficiais.";

/** Janela em que os dados armazenados do Threads são considerados atuais. */
const THREADS_FRESH_MS = 5 * 60_000;

/**
 * Garante dados recentes antes de qualquer leitura: se a última coleta oficial
 * de alguma conta do Threads passou da janela de frescor, sincroniza agora.
 * Falhas aqui nunca quebram a leitura — mostramos o que já existe no banco.
 */
async function ensureFreshThreadsData(userId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("instagram_accounts")
      .select("last_sync_at")
      .eq("user_id", userId)
      .eq("platform", "threads")
      .eq("status", "connected");
    const accounts = data ?? [];
    if (accounts.length === 0) return;
    const stale = accounts.some((a) => {
      const ts = a.last_sync_at ? Date.parse(a.last_sync_at) : NaN;
      return !Number.isFinite(ts) || Date.now() - ts > THREADS_FRESH_MS;
    });
    if (stale) await syncThreadsInsights(userId);
  } catch {
    // sincronização automática indisponível — segue com os dados já gravados
  }
}

/** Resumo por conta do Threads: seguidores e views em 1, 7 e 30 dias (dados armazenados). */
export async function fetchThreadsAccountsInsights(userId: string) {
  await ensureFreshThreadsData(userId);
  const accounts = await threadsAccounts(userId);

  const rows = await dailyMetricRows(
    userId,
    accounts.map((a) => a.id),
    shiftDay(todayUtc(), -29),
  );
  return accounts.map((acc) => {
    const w1 = aggregateDailyWindow(rows, acc.id, "views", 1);
    const w7 = aggregateDailyWindow(rows, acc.id, "views", 7);
    const w30 = aggregateDailyWindow(rows, acc.id, "views", 30);
    const followers = latestFollowers(rows, acc.id);
    const out: {
      accountId: string;
      username: string;
      followers: number | null;
      views: number | null;
      views7d: number | null;
      views30d: number | null;
      error?: string;
    } = {
      accountId: acc.id,
      username: acc.username,
      followers,
      views: w1.value,
      views7d: w7.value,
      views30d: w30.value,
    };
    if (followers === null && w7.daysAvailable === 0 && w30.daysAvailable === 0) {
      out.error = THREADS_NO_DATA;
    }
    return out;
  });
}

/** Métricas por publicação do Threads nos últimos N dias (dados armazenados). */
export async function fetchThreadsPostsMetrics(userId: string, days = 30) {
  const { posts, errors } = await storedMediaRows(userId, "threads", days);
  const byDay = new Map<string, { day: string; views: number | null; likes: number | null; shares: number | null }>();
  for (const p of posts) {
    const day = p.timestamp.slice(0, 10);
    const bucket = byDay.get(day) ?? { day, views: null, likes: null, shares: null };
    bucket.views = bucket.views === null && p.views === null ? null : (bucket.views ?? 0) + (p.views ?? 0);
    bucket.likes = bucket.likes === null && p.likes === null ? null : (bucket.likes ?? 0) + (p.likes ?? 0);
    bucket.shares = bucket.shares === null && p.shares === null ? null : (bucket.shares ?? 0) + (p.shares ?? 0);
    byDay.set(day, bucket);
  }
  const sum = (key: "views" | "likes" | "shares" | "comments") => {
    const values = posts.filter((p) => p[key] !== null);
    return values.length ? values.reduce((acc, p) => acc + (p[key] as number), 0) : null;
  };
  return {
    posts,
    series: Array.from(byDay.entries())
      .map(([day, v]) => ({ ...v, day }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    totals: {
      views: sum("views"),
      likes: sum("likes"),
      shares: sum("shares"),
      comments: sum("comments"),
    },
    errors,
  };
}

/**
 * Coleta os insights oficiais do Threads e os armazena no banco:
 * - perfil/conta atualizada em instagram_accounts;
 * - seguidores e views diárias em account_daily_metrics (quando a API devolver a série);
 * - cada thread recente com suas métricas em ig_media (vinculada à conta).
 * Nunca converte ausência em zero — métrica indisponível fica nula.
 */
export async function syncThreadsInsights(
  userId: string,
  options: { limitPerAccount?: number } = {},
) {
  const { limitPerAccount = 40 } = options;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const accounts = await threadsAccounts(userId);

  let mediaUpserted = 0;
  let errors = 0;
  const messages: string[] = [];
  const nowIso = new Date().toISOString();

  for (const acc of accounts) {
    try {
      const token = await tokenFor(acc.id, userId);
      if (!token) {
        errors++;
        messages.push(`@${acc.username}: sem token salvo.`);
        continue;
      }

      // Perfil atual (também valida o token e renova o last_sync_at).
      try {
        const me = await threads(
          `${THREADS_API}/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
        );
        await supabaseAdmin
          .from("instagram_accounts")
          .update({
            username: String(me["username"] ?? acc.username),
            display_name: (me["name"] as string) ?? null,
            profile_picture_url: (me["threads_profile_picture_url"] as string) ?? null,
            last_sync_at: nowIso,
            status: "connected",
          })
          .eq("id", acc.id)
          .eq("user_id", userId);
      } catch (e) {
        errors++;
        messages.push(`@${acc.username}: perfil indisponível (${e instanceof Error ? e.message : "erro"}).`);
        continue;
      }

      // Seguidores + série diária de views dos últimos 30 dias (melhor esforço).
      let followers: number | null = null;
      try {
        const res = await threads(
          `${THREADS_API}/me/threads_insights?metric=followers_count&access_token=${encodeURIComponent(token)}`,
        );
        followers = metricValue(res, "followers_count");
      } catch {
        // conta sem métrica de seguidores disponível
      }

      const dayViews = new Map<string, number>();
      try {
        const until = Math.floor(Date.now() / 1000);
        const since = until - 30 * 86400;
        const res = await threads(
          `${THREADS_API}/me/threads_insights?metric=views&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
        );
        const rows = (res["data"] as Record<string, unknown>[] | undefined) ?? [];
        const viewsRow = rows.find((r) => String(r["name"] ?? "") === "views");
        const values = (viewsRow?.["values"] as { value?: number; end_time?: string }[] | undefined) ?? [];
        if (values.length >= 2) {
          for (const v of values) {
            if (typeof v.value === "number" && v.end_time) {
              const day = v.end_time.slice(0, 10);
              dayViews.set(day, (dayViews.get(day) ?? 0) + v.value);
            }
          }
        }
        // Se a API devolver só o total do período (sem quebra por dia), NÃO
        // gravamos esse total como se fosse "hoje": isso corromperia a série
        // diária e os painéis de 7/30 dias.
      } catch {
        // métrica de views do Threads indisponível — não inventar dado
      }

      const maxDay = dayViews.size
        ? [...dayViews.keys()].sort((a, b) => b.localeCompare(a))[0]!
        : todayUtc();
      if (dayViews.size) {
        for (const [day, views] of dayViews) {
          await supabaseAdmin.from("account_daily_metrics").upsert(
            {
              user_id: userId,
              account_id: acc.id,
              day,
              views,
              followers: day === maxDay ? followers : null,
            },
            { onConflict: "account_id,day" },
          );
        }
      } else if (followers !== null) {
        await supabaseAdmin.from("account_daily_metrics").upsert(
          { user_id: userId, account_id: acc.id, day: todayUtc(), followers },
          { onConflict: "account_id,day" },
        );
      }

      // Threads recentes + métricas por publicação.
      try {
        const list = await threads(
          `${THREADS_API}/me/threads?fields=id,text,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limitPerAccount}&access_token=${encodeURIComponent(token)}`,
        );
        const items = ((list["data"] as Record<string, unknown>[] | undefined) ?? []).slice(0, limitPerAccount);
        for (const item of items) {
          const threadId = String(item["id"] ?? "");
          if (!threadId) continue;
          const bag: Record<string, number | null> = { views: null, likes: null, replies: null, reposts: null, quotes: null };
          try {
            const ins = await threads(
              `${THREADS_API}/${threadId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(token)}`,
            );
            bag["views"] = metricValue(ins, "views");
            bag["likes"] = metricValue(ins, "likes");
            bag["replies"] = metricValue(ins, "replies");
            bag["reposts"] = metricValue(ins, "reposts");
            bag["quotes"] = metricValue(ins, "quotes");
          } catch {
            // insights indisponíveis para este thread (ex.: muito recente)
          }
          const reposts = bag["reposts"];
          const quotes = bag["quotes"];
          const publishedAt = typeof item["timestamp"] === "string" ? item["timestamp"] : null;
          const mediaType = String(item["media_type"] ?? "TEXT");

          // Nunca sobrescreve métrica já gravada com null por falha transitória.
          const { data: previousThread } = await (
            supabaseAdmin.from("ig_media") as unknown as LooseTable
          )
            .select("views, likes, comments, shares")
            .eq("user_id", userId)
            .eq("account_id", acc.id)
            .eq("ig_media_id", threadId)
            .maybeSingle();
          const previousThreadRow = (previousThread ?? {}) as {
            views: number | null;
            likes: number | null;
            comments: number | null;
            shares: number | null;
          };
          const threadViews = bag["views"] ?? previousThreadRow.views;
          const threadLikes = bag["likes"] ?? previousThreadRow.likes;
          const threadComments = bag["replies"] ?? previousThreadRow.comments;
          const threadShares =
            reposts === null && quotes === null
              ? previousThreadRow.shares
              : (reposts ?? 0) + (quotes ?? 0);
          const unavailable: string[] = (
            [
              ["views", threadViews],
              ["likes", threadLikes],
              ["comments", threadComments],
              ["shares", threadShares],
            ] as const
          )
            .filter(([, v]) => v === null)
            .map(([k]) => k);
          const { data: row } = await (supabaseAdmin.from("ig_media") as unknown as LooseTable)
            .upsert(
              {
                user_id: userId,
                account_id: acc.id,
                ig_media_id: threadId,
                media_type: mediaType,
                format: mediaType === "CAROUSEL_ALBUM" ? "CAROUSEL" : mediaType,
                caption: typeof item["text"] === "string" ? (item["text"] as string) : null,
                hashtags: [],
                permalink: typeof item["permalink"] === "string" ? (item["permalink"] as string) : null,
                thumbnail_url: (item["thumbnail_url"] as string) ?? (item["media_url"] as string) ?? null,
                media_url: (item["media_url"] as string) ?? null,
                published_at: publishedAt,
                views: threadViews,
                likes: threadLikes,
                comments: threadComments,
                shares: threadShares,
                reach: null,
                saved: null,
                total_interactions: null,
                unavailable_metrics: unavailable,
                last_synced_at: nowIso,
              },
              { onConflict: "account_id,ig_media_id" },
            )
            .select("id")
            .single();
          if ((row as { id?: string } | null)?.id) mediaUpserted++;
        }
      } catch (e) {
        errors++;
        messages.push(`@${acc.username}: mídias do Threads indisponíveis (${e instanceof Error ? e.message : "erro"}).`);
      }

    } catch (e) {
      errors++;
      messages.push(`@${acc.username}: ${e instanceof Error ? e.message : "falha ao coletar Threads."}`);
    }
  }

  return { accounts_processed: accounts.length, media_upserted: mediaUpserted, errors, messages: messages.slice(0, 5) };
}


