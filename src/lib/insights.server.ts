// Server-only: coleta histórica de mídias e insights pela API oficial da Meta.
import { humanizeMetaError, readMetaEnv, writeLog } from "./meta.server";

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

async function tokenFor(accountId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("account_tokens")
    .select("access_token")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.access_token ?? null;
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

/** Sincroniza mídias, insights e snapshots de todas as contas conectadas. */
export async function syncInsights(userId: string, limitPerAccount = 50) {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: run } = await supabaseAdmin
    .from("sync_executions")
    .insert({ user_id: userId, kind: "insights", status: "running" })
    .select("id")
    .single();

  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username")
    .eq("user_id", userId)
    .eq("status", "connected");

  let mediaUpserted = 0;
  let snapshotsWritten = 0;
  let errors = 0;
  const messages: string[] = [];

  for (const acc of accounts ?? []) {
    const token = await tokenFor(acc.id, userId);
    if (!token) {
      errors++;
      messages.push(`@${acc.username}: sem token salvo.`);
      continue;
    }

    // Métricas diárias da conta
    try {
      const me = await graphGet(
        `https://graph.instagram.com/${env.graphVersion}/me?fields=followers_count&access_token=${encodeURIComponent(token)}`,
      );
      const until = Math.floor(Date.now() / 1000);
      const since = until - 86400;
      const unavailable: string[] = [];
      const accountValues: Record<string, number | null> = { views: null, reach: null, profile_views: null };
      for (const metric of ["views", "reach", "profile_views"]) {
        try {
          const ins = await graphGet(
            `https://graph.instagram.com/${env.graphVersion}/me/insights?metric=${metric}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`,
          );
          const arr = (ins["data"] as { total_value?: { value?: number } }[] | undefined) ?? [];
          const v = arr.find((m) => typeof m.total_value?.value === "number")?.total_value?.value;
          if (typeof v === "number") accountValues[metric] = v;
          else unavailable.push(metric);
        } catch {
          unavailable.push(metric);
        }
      }
      await supabaseAdmin.from("account_daily_metrics").upsert(
        {
          user_id: userId,
          account_id: acc.id,
          day: new Date().toISOString().slice(0, 10),
          followers: (me["followers_count"] as number) ?? null,
          views: accountValues["views"] ?? null,
          reach: accountValues["reach"] ?? null,
          profile_views: accountValues["profile_views"] ?? null,
          unavailable_metrics: unavailable,
        },
        { onConflict: "account_id,day" },
      );
    } catch (e) {
      errors++;
      messages.push(`@${acc.username}: métricas diárias indisponíveis (${e instanceof Error ? e.message : "erro"}).`);
    }

    // Mídias + insights por publicação
    try {
      const list = await graphGet(
        `https://graph.instagram.com/${env.graphVersion}/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp&limit=${limitPerAccount}&access_token=${encodeURIComponent(token)}`,
      );
      const items =
        (list["data"] as
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
          | undefined) ?? [];

      for (const item of items) {
        const bag = await mediaInsights(item.id, token, env.graphVersion);
        const publishedAt = item.timestamp ? new Date(item.timestamp).toISOString() : null;

        const { data: row } = await supabaseAdmin
          .from("ig_media")
          .upsert(
            {
              user_id: userId,
              account_id: acc.id,
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
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "account_id,ig_media_id" },
          )
          .select("id")
          .single();
        mediaUpserted++;

        // Snapshot da janela de idade correspondente (idempotente por janela)
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
      messages.push(`@${acc.username}: ${e instanceof Error ? e.message : "falha ao coletar mídias."}`);
    }
  }

  const summary = {
    status: errors && !mediaUpserted ? "failed" : "success",
    accounts_processed: (accounts ?? []).length,
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
    errors ? "warn" : "success",
    `Sincronização de insights: ${mediaUpserted} publicações, ${snapshotsWritten} snapshots, ${errors} erros.`,
  );

  return summary;
}
