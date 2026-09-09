// Server-only: coletor de métricas 100% oficiais (API da Meta/Threads) para o
// banco. Única porta de entrada: syncInsights(). As páginas NÃO chamam a API
// ao vivo — leem o que este coletor gravou (ig_media / account_daily_metrics).
import { readMetaEnv, humanizeMetaError, writeLog, tokenFor, accountsForPlatform } from "./meta.server";

export type SyncOptions = { deep?: boolean; limitPerAccount?: number };

const MEDIA_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"] as const;
type MediaMetric = (typeof MEDIA_METRICS)[number];

export const SNAPSHOT_WINDOWS: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 },
  { label: "3h", hours: 3 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET com backoff exponencial para respeitar o rate limit da Meta. */
async function graphGet(url: string, tries = 3): Promise<Record<string, unknown>> {
  let lastError = "Falha ao falar com a API da Meta.";
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url);
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && !json["error"]) return json;
      lastError = humanizeMetaError(json);
      const code = (json["error"] as { code?: number } | undefined)?.code;
      const retryable = res.status === 429 || res.status >= 500 || code === 4 || code === 17 || code === 32;
      if (!retryable) throw new Error(lastError);
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
      if (attempt === tries - 1) throw new Error(lastError);
    }
    await sleep(600 * 2 ** attempt);
  }
  throw new Error(lastError);
}

export function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const found = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(found.map((h) => h.toLowerCase()))].slice(0, 40);
}

function formatOf(mediaType?: string | null, productType?: string | null) {
  if (productType === "REELS") return "REEL";
  if (productType === "STORY") return "STORY";
  if (mediaType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (mediaType === "VIDEO") return "REEL";
  return "POST";
}

type MetricBag = { values: Partial<Record<MediaMetric, number>>; unavailable: string[] };

async function mediaInsights(mediaId: string, token: string, version: string): Promise<MetricBag> {
  const values: Partial<Record<MediaMetric, number>> = {};
  const unavailable: string[] = [];
  try {
    const json = await graphGet(
      `https://graph.instagram.com/${version}/${mediaId}/insights?metric=${MEDIA_METRICS.join(
        ",",
      )}&access_token=${encodeURIComponent(token)}`,
    );
    const arr = (json["data"] as { name?: string; values?: { value?: number }[] }[] | undefined) ?? [];
    for (const metric of MEDIA_METRICS) {
      const found = arr.find((m) => m.name === metric);
      const v = found?.values?.[0]?.value;
      if (typeof v === "number") values[metric] = v;
      else unavailable.push(metric);
    }
  } catch {
    // Métrica ausente é registrada como indisponível — nunca como zero.
    unavailable.push(...MEDIA_METRICS);
  }
  return { values, unavailable };
}

// ---------------------------------------------------------------------------
// Métricas diárias da conta (Instagram)
// ---------------------------------------------------------------------------

/**
 * Preenche account_daily_metrics com os valores oficiais dia a dia.
 * Modo leve (cron): atualiza os 2 dias mais recentes.
 * Modo profundo (botão Sincronizar agora): completa até 30 dias de histórico.
 */
async function syncInstagramAccountDaily(
  userId: string,
  accountId: string,
  token: string,
  version: string,
  deep: boolean,
  currentFollowers: number | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const offsets = deep ? 30 : 2; // 0 = hoje
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const until = Math.floor(Date.now() / 1000);
  const perMetric = new Map<string, Map<string, number>>();

  for (const metric of ["views", "reach", "profile_views"] as const) {
    const dayMap = new Map<string, number>();
    let gotSeries = false;
    try {
      const series = await graphGet(
        `https://graph.instagram.com/${version}/me/insights?metric=${metric}&period=day&metric_type=time_series&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
      );
      const rows = (series["data"] as { name?: string; values?: { value?: number; end_time?: string }[] }[] | undefined) ?? [];
      for (const row of rows) {
        for (const v of row.values ?? []) {
          if (typeof v.value === "number" && v.end_time) {
            const day = v.end_time.slice(0, 10);
            dayMap.set(day, (dayMap.get(day) ?? 0) + v.value);
            gotSeries = true;
          }
        }
      }
    } catch {
      // série indisponível: tenta janela a janela abaixo
    }
    if (!gotSeries) {
      for (let i = 0; i < offsets; i++) {
        const end = until - i * 86400;
        try {
          const json = await graphGet(
            `https://graph.instagram.com/${version}/me/insights?metric=${metric}&period=day&metric_type=total_value&since=${end - 86400}&until=${end}&access_token=${encodeURIComponent(token)}`,
          );
          const arr = (json["data"] as { total_value?: { value?: number } }[] | undefined) ?? [];
          const value = arr.find((m) => typeof m.total_value?.value === "number")?.total_value?.value;
          if (typeof value === "number") {
            const day = new Date(end * 1000).toISOString().slice(0, 10);
            dayMap.set(day, value);
          }
        } catch {
          // dia sem métrica oficial — deixa ausente (nunca zero)
        }
        await sleep(220);
      }
    }
    perMetric.set(metric, dayMap);
  }

  // Ganhos diários de seguidores (série oficial) para reconstruir o total por dia.
  const gainsByDay = new Map<string, number>();
  try {
    const followerSeries = await graphGet(
      `https://graph.instagram.com/${version}/me/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
    );
    const rows = (followerSeries["data"] as { name?: string; values?: { value?: number; end_time?: string }[] }[] | undefined) ?? [];
    for (const row of rows) {
      for (const v of row.values ?? []) {
        if (typeof v.value === "number" && v.end_time) {
          const day = v.end_time.slice(0, 10);
          gainsByDay.set(day, (gainsByDay.get(day) ?? 0) + v.value);
        }
      }
    }
  } catch {
    // conta sem histórico de seguidores
  }

  // Reconstroi o total de seguidores retroativamente a partir do atual.
  const allDays = new Set<string>([...gainsByDay.keys()]);
  for (const m of perMetric.values()) for (const day of m.keys()) allDays.add(day);
  const sorted = [...allDays].sort();
  const followersByDay = new Map<string, number>();
  if (currentFollowers !== null) {
    let running = currentFollowers;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const day = sorted[i]!;
      followersByDay.set(day, running);
      running -= gainsByDay.get(day) ?? 0;
    }
  }

  type AccountDayValues = { views: number | null; reach: number | null; profile_views: number | null; followers: number | null };
  const rowsToWrite = new Map<string, AccountDayValues>();
  for (const [metric, dayMap] of perMetric) {
    for (const [day, value] of dayMap) {
      const entry = rowsToWrite.get(day) ?? { views: null, reach: null, profile_views: null, followers: null };
      if (metric === "views") entry.views = value;
      if (metric === "reach") entry.reach = value;
      if (metric === "profile_views") entry.profile_views = value;
      rowsToWrite.set(day, entry);
    }
  }
  const lastDay = [...rowsToWrite.keys()].sort().pop();
  if (lastDay && currentFollowers !== null) {
    rowsToWrite.set(lastDay, { ...rowsToWrite.get(lastDay)!, followers: currentFollowers });
  }
  for (const [day, entry] of rowsToWrite) {
    await supabaseAdmin.from("account_daily_metrics").upsert(
      {
        user_id: userId,
        account_id: accountId,
        day,
        followers: entry.followers ?? followersByDay.get(day) ?? null,
        views: entry.views,
        reach: entry.reach,
        profile_views: entry.profile_views,
      },
      { onConflict: "account_id,day" },
    );
  }
}

// ---------------------------------------------------------------------------
// Sincronização Instagram (diárias + mídias + insights por publicação)
// ---------------------------------------------------------------------------

async function syncInstagramAccount(
  userId: string,
  account: { id: string; username: string },
  env: ReturnType<typeof readMetaEnv>,
  deep: boolean,
  limitPerAccount: number,
): Promise<{ mediaUpserted: number; snapshotsWritten: number; errors: number; message: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let mediaUpserted = 0;
  let snapshotsWritten = 0;
  let errors = 0;
  const messages: string[] = [];
  const nowIso = new Date().toISOString();
  const token = await tokenFor(account.id, userId);
  if (!token) {
    return { mediaUpserted, snapshotsWritten, errors: 1, message: `@${account.username}: sem token salvo.` };
  }

  // Perfil e métricas diárias da conta.
  try {
    const me = await graphGet(
      `https://graph.instagram.com/${env.graphVersion}/me?fields=followers_count,media_count&access_token=${encodeURIComponent(token)}`,
    );
    const followers = (me["followers_count"] as number | undefined) ?? null;
    await syncInstagramAccountDaily(userId, account.id, token, env.graphVersion, deep, followers);
    await supabaseAdmin
      .from("instagram_accounts")
      .update({ last_sync_at: nowIso, status: "connected" })
      .eq("id", account.id)
      .eq("user_id", userId);
  } catch (e) {
    errors++;
    messages.push(`@${account.username}: métricas diárias indisponíveis (${e instanceof Error ? e.message : "erro"}).`);
  }

  // Mídias + insights por publicação.
  try {
    const list = await graphGet(
      `https://graph.instagram.com/${env.graphVersion}/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp&limit=${limitPerAccount}&access_token=${encodeURIComponent(token)}`,
    );
    const items =
      ((list["data"] as
        | {
            id: string;
            caption?: string;
            media_type?: string;
            media_product_type?: string;
            media_url?: string;
            thumbnail_url?: string;
            permalink?: string;
            timestamp?: string;
          }[]
        | undefined) ?? []);
    for (const item of items.slice(0, limitPerAccount)) {
      const bag = await mediaInsights(item.id, token, env.graphVersion);
      const publishedAt = item.timestamp ? new Date(item.timestamp).toISOString() : null;
      const { data: row } = await supabaseAdmin
        .from("ig_media")
        .upsert(
          {
            user_id: userId,
            account_id: account.id,
            ig_media_id: item.id,
            media_type: item.media_type ?? null,
            media_product_type: item.media_product_type ?? null,
            format: formatOf(item.media_type, item.media_product_type),
            caption: item.caption ?? null,
            hashtags: extractHashtags(item.caption),
            permalink: item.permalink ?? null,
            thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
            media_url: item.media_url ?? null,
            published_at: publishedAt,
            views: bag.values.views ?? null,
            reach: bag.values.reach ?? null,
            likes: bag.values.likes ?? null,
            comments: bag.values.comments ?? null,
            shares: bag.values.shares ?? null,
            saved: bag.values.saved ?? null,
            total_interactions: bag.values.total_interactions ?? null,
            unavailable_metrics: bag.unavailable,
            api_version: env.graphVersion,
            last_synced_at: nowIso,
          },
          { onConflict: "account_id,ig_media_id" },
        )
        .select("id")
        .single();
      mediaUpserted++;

      // Snapshot da janela de idade correspondente (idempotente por janela).
      if (row?.id && publishedAt) {
        const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
        const win = [...SNAPSHOT_WINDOWS].reverse().find((w) => ageHours >= w.hours);
        if (win) {
          const { data: exists } = await supabaseAdmin
            .from("media_snapshots")
            .select("id")
            .eq("user_id", userId)
            .eq("media_row_id", row.id)
            .eq("window_label", win.label)
            .maybeSingle();
          if (!exists) {
            await supabaseAdmin.from("media_snapshots").insert({
              user_id: userId,
              media_row_id: row.id,
              window_label: win.label,
              age_hours: Number(ageHours.toFixed(2)),
              views: bag.values.views ?? null,
              reach: bag.values.reach ?? null,
              likes: bag.values.likes ?? null,
              comments: bag.values.comments ?? null,
              shares: bag.values.shares ?? null,
              saved: bag.values.saved ?? null,
              total_interactions: bag.values.total_interactions ?? null,
              unavailable_metrics: bag.unavailable,
            });
            snapshotsWritten++;
          }
        }
      }
    }
  } catch (e) {
    errors++;
    messages.push(`@${account.username}: ${e instanceof Error ? e.message : "falha ao coletar mídias."}`);
  }

  return { mediaUpserted, snapshotsWritten, errors, message: messages[0] ?? null };
}

// ---------------------------------------------------------------------------
// Orquestração — uma entrada para Instagram + Threads
// ---------------------------------------------------------------------------

/** Sincroniza métricas oficiais de todas as contas conectadas (IG + Threads). */
export async function syncInsights(userId: string, options: SyncOptions = {}): Promise<{
  status: string;
  accounts_processed: number;
  media_upserted: number;
  snapshots_written: number;
  errors: number;
  message: string | null;
  finished_at: string;
}> {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const deep = Boolean(options.deep);
  const limitPerAccount = options.limitPerAccount ?? (deep ? 30 : 15);

  const { data: run } = await supabaseAdmin
    .from("sync_executions")
    .insert({ user_id: userId, kind: "insights", status: "running" })
    .select("id")
    .single();

  const igAccounts = await accountsForPlatform(userId, "instagram");
  let mediaUpserted = 0;
  let snapshotsWritten = 0;
  let errors = 0;
  const messages: string[] = [];

  for (const acc of igAccounts) {
    const result = await syncInstagramAccount(
      userId,
      { id: acc.id, username: acc.username },
      env,
      deep,
      limitPerAccount,
    );
    mediaUpserted += result.mediaUpserted;
    snapshotsWritten += result.snapshotsWritten;
    errors += result.errors;
    if (result.message) messages.push(result.message);
  }

  // Threads: conta em instagram_accounts (platform='threads') tem coletor próprio.
  const { syncThreadsInsights } = await import("./threads.server");
  const threadsResult = await syncThreadsInsights(userId, { limitPerAccount });
  mediaUpserted += threadsResult.media_upserted;
  errors += threadsResult.errors;
  messages.push(...threadsResult.messages);

  const summary = {
    status: errors && !mediaUpserted ? "failed" : "success",
    accounts_processed: igAccounts.length + threadsResult.accounts_processed,
    media_upserted: mediaUpserted,
    snapshots_written: snapshotsWritten,
    errors,
    message: messages.slice(0, 5).join(" | ") || null,
    finished_at: new Date().toISOString(),
  };

  if (run?.id) await supabaseAdmin.from("sync_executions").update(summary).eq("id", run.id).eq("user_id", userId);
  await writeLog(
    userId,
    "insights",
    summary.errors ? "warn" : "success",
    `Sincronização de insights: ${mediaUpserted} publicações, ${snapshotsWritten} snapshots, ${summary.errors} erros.`,
  );

  return summary;
}



