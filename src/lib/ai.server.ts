// Server-only: transforma os dados coletados (ig_media / account_daily_metrics) no
// diagnóstico de crescimento da página Saúde. Sem modelos de linguagem externos.
import {
  buildHeatmap,
  buildGrowthHealth,
  bestSlots,
  DOW_LABELS,
  durationBucket,
  maturityFor,
  mean,
  median,
  rankBy,
  scoreMedia,
  trendOf,
  weeklyFrequency,
  worstSlots,
  type MediaRow,
} from "./intelligence";

export type AccountIntelligence = Awaited<ReturnType<typeof buildAccountIntelligence>>;

const MEDIA_COLUMNS =
  "id, account_id, format, caption, hashtags, permalink, thumbnail_url, duration_seconds, published_at, views, reach, likes, comments, shares, saved, total_interactions, unavailable_metrics";

async function loadMedia(userId: string, accountId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("ig_media")
    .select(MEDIA_COLUMNS)
    .eq("user_id", userId)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(500);
  if (accountId) query = query.eq("account_id", accountId);
  const { data } = await query;
  return (data ?? []) as unknown as (MediaRow & { unavailable_metrics: string[] })[];
}

function ratio(a: number | null | undefined, b: number | null | undefined) {
  if (typeof a !== "number" || typeof b !== "number" || b <= 0) return null;
  return a / b;
}

export async function buildAccountIntelligence(userId: string, accountId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await loadMedia(userId, accountId);
  const { scored, baseline } = scoreMedia(rows);
  const analyzed = scored.filter((s) => s.perf !== null);

  const heatmap = buildHeatmap(scored);
  const byFormat = rankBy(scored, (s) => s.format);
  const byDow = rankBy(scored, (s) => DOW_LABELS[s.dow] ?? null);
  const byDuration = rankBy(scored, (s) => durationBucket(s.duration_seconds));
  const byHashtag = rankBy(scored, (s) => s.hashtags?.[0] ?? null).filter((r) => r.samples >= 2);

  const { data: daily } = await supabaseAdmin
    .from("account_daily_metrics")
    .select("day, followers, views, reach, account_id")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(120);
  const dailyRows = (daily ?? []).filter((d) => !accountId || d.account_id === accountId);
  const followers = dailyRows.find((d) => typeof d.followers === "number")?.followers ?? null;

  const top = [...analyzed].sort((a, b) => (b.perf as number) - (a.perf as number)).slice(0, 5);
  const bottom = [...analyzed].sort((a, b) => (a.perf as number) - (b.perf as number)).slice(0, 5);

  const unavailable = [...new Set(rows.flatMap((r) => r.unavailable_metrics ?? []))];

  // Taxas sobre alcance calculadas apenas nos posts que têm alcance + a métrica.
  // Antes, "total de interações" incluía posts sem alcance (e zeros no lugar de
  // métrica ausente), o que distorcia o engajamento — especialmente em contas
  // com muitos Reels, que não devolvem alcance por publicação.
  const reachable = analyzed.filter((a) => a.reach !== null);
  const interactionsOf = (media: (typeof analyzed)[number]): number | null => {
    if (typeof media.total_interactions === "number") return media.total_interactions;
    const parts = [media.likes, media.comments, media.shares].filter((v): v is number => typeof v === "number");
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const ratePerReach = (pick: (media: (typeof analyzed)[number]) => number | null) => {
    const withBoth = reachable.filter((media) => pick(media) !== null);
    const numerator = mean(withBoth.map((media) => pick(media) as number));
    const denominator = mean(withBoth.map((media) => media.reach as number));
    return ratio(numerator, denominator);
  };

  return {
    accountId,
    postsAnalyzed: analyzed.length,
    postsCollected: rows.length,
    maturity: maturityFor(analyzed.length),
    baselineViews: baseline,
    followers,
    trend: trendOf(scored),
    weeklyFrequency: weeklyFrequency(scored),
    calculated: {
      medianViews: median(analyzed.map((a) => a.views as number)),
      medianReach: median(reachable.map((a) => a.reach as number)),
      viewsPerFollower: ratio(median(analyzed.map((a) => a.views as number)), followers),
      engagementPerReach: ratePerReach(interactionsOf),
      savesPerReach: ratePerReach((media) => media.saved),
      sharesPerReach: ratePerReach((media) => media.shares),
    },
    heatmap,
    bestSlots: bestSlots(heatmap),
    avoidSlots: worstSlots(heatmap),
    byFormat,
    byDow,
    byDuration,
    byHashtag: byHashtag.slice(0, 8),
    topPosts: top.map((t) => ({
      id: t.id,
      permalink: t.permalink,
      thumbnail: t.thumbnail_url,
      format: t.format,
      views: t.views,
      perf: t.perf,
      publishedAt: t.published_at,
      caption: t.caption?.slice(0, 120) ?? null,
    })),
    bottomPosts: bottom.map((t) => ({
      id: t.id,
      permalink: t.permalink,
      thumbnail: t.thumbnail_url,
      format: t.format,
      views: t.views,
      perf: t.perf,
      publishedAt: t.published_at,
      caption: t.caption?.slice(0, 120) ?? null,
    })),
    unavailableMetrics: unavailable,
  };
}

export async function buildGrowthHealthReport(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: accounts, error } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username, display_name, profile_picture_url, last_sync_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Não foi possível carregar as contas para o diagnóstico.");

  return Promise.all((accounts ?? []).map(async (account) => {
    const intelligence = await buildAccountIntelligence(userId, account.id);
    const health = buildGrowthHealth({
      postsAnalyzed: intelligence.postsAnalyzed,
      postsCollected: intelligence.postsCollected,
      trend: intelligence.trend,
      weeklyFrequency: intelligence.weeklyFrequency,
      followers: intelligence.followers,
      medianViews: intelligence.calculated.medianViews,
      engagementPerReach: intelligence.calculated.engagementPerReach,
      savesPerReach: intelligence.calculated.savesPerReach,
      sharesPerReach: intelligence.calculated.sharesPerReach,
      viewsPerFollower: intelligence.calculated.viewsPerFollower,
      bestFormatScore: intelligence.byFormat[0]?.score ?? null,
      bestSlotScore: intelligence.bestSlots[0]?.score ?? null,
    });
    return {
      account,
      ...health,
      postsAnalyzed: intelligence.postsAnalyzed,
      postsCollected: intelligence.postsCollected,
      periodLabel: "Últimos dados disponíveis (até 500 publicações)",
    };
  }));
}

