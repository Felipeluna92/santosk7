// Server-only helpers for the official Threads API (graph.threads.net).
// Never import this from client code.

import { writeLog } from "./meta.server";

const THREADS_API = "https://graph.threads.net/v1.0";

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];

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

/** Conecta uma conta do Threads validando o token contra a API oficial. */
export async function connectThreadsWithToken(rawToken: string, userId: string) {
  const input = rawToken.trim();
  if (input.length < 20) throw new Error("Token inválido. Cole o token de acesso completo do Threads.");

  let token = input;
  let expiresIn: number | null = null;
  const appSecret = process.env["META_APP_SECRET"];

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
        scopes: THREADS_SCOPES,
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
  meta_container_id: string | null;
};

/**
 * Publica um post no Threads em duas etapas (container + publish).
 * Suporta texto puro, imagem e vídeo — o Threads não tem Reels, carrossel de
 * mídia mista nem Stories nesta API.
 */
export async function publishThreadsPost(post: ThreadsPost, threadsUserId: string, token: string) {
  const text = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n");
  const url = (post.media_url ?? "").trim();
  const isVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(url);

  if (!text && !url) throw new Error("Escreva um texto ou anexe uma mídia para publicar no Threads.");

  let containerId = post.meta_container_id ?? "";
  if (!containerId) {
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
  }

  if (url) {
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
