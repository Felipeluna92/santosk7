// Server-only: transforma dados coletados em inteligência de conteúdo.
// O backend calcula tudo; o modelo de linguagem apenas explica os números já calculados.
import {
  buildHeatmap,
  bestSlots,
  DOW_LABELS,
  durationBucket,
  maturityFor,
  mean,
  median,
  predictRange,
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

async function loadMedia(accountId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("ig_media")
    .select(MEDIA_COLUMNS)
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

export async function buildAccountIntelligence(accountId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await loadMedia(accountId);
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
    .order("day", { ascending: false })
    .limit(120);
  const dailyRows = (daily ?? []).filter((d) => !accountId || d.account_id === accountId);
  const followers = dailyRows.find((d) => typeof d.followers === "number")?.followers ?? null;

  const top = [...analyzed].sort((a, b) => (b.perf as number) - (a.perf as number)).slice(0, 5);
  const bottom = [...analyzed].sort((a, b) => (a.perf as number) - (b.perf as number)).slice(0, 5);

  const unavailable = [...new Set(rows.flatMap((r) => r.unavailable_metrics ?? []))];

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
      medianReach: median(analyzed.filter((a) => a.reach !== null).map((a) => a.reach as number)),
      viewsPerFollower: ratio(median(analyzed.map((a) => a.views as number)), followers),
      engagementPerReach: ratio(
        mean(analyzed.map((a) => a.total_interactions ?? 0)),
        mean(analyzed.filter((a) => a.reach !== null).map((a) => a.reach as number)),
      ),
      savesPerReach: ratio(
        mean(analyzed.map((a) => a.saved ?? 0)),
        mean(analyzed.filter((a) => a.reach !== null).map((a) => a.reach as number)),
      ),
      sharesPerReach: ratio(
        mean(analyzed.map((a) => a.shares ?? 0)),
        mean(analyzed.filter((a) => a.reach !== null).map((a) => a.reach as number)),
      ),
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

/** Previsão por vizinhos comparáveis do próprio histórico. Nunca um número único. */
export async function predictPerformance(input: {
  accountId: string;
  format: string;
  dow: number;
  hour: number;
}) {
  const rows = await loadMedia(input.accountId);
  const { scored } = scoreMedia(rows);
  const sameFormat = scored.filter((s) => s.format === input.format && typeof s.views === "number");
  const nearSlot = sameFormat.filter(
    (s) => s.dow === input.dow && Math.abs(s.hour - input.hour) <= 2,
  );
  const pool = nearSlot.length >= 3 ? nearSlot : sameFormat;
  const range = predictRange(pool.map((p) => p.views as number));
  return {
    range,
    basedOn: pool.length,
    matched: nearSlot.length >= 3 ? "formato + faixa de horário" : "formato",
    note: range
      ? null
      : "Ainda não existem dados suficientes para uma previsão confiável. Publique mais neste formato para melhorar a estimativa.",
  };
}

const SYSTEM_PROMPT = `Você é a AI Cálica, analista de conteúdo do Instagram do usuário.
Regras invioláveis:
- Responda em português do Brasil, direto e prático.
- Use SOMENTE os números do JSON fornecido. Nunca invente métricas nem estime valores fora dele.
- Se o JSON não tiver dados suficientes, diga claramente que não dá para concluir com confiança.
- Recomendações são probabilidades, não garantias. Nunca use "viral garantido", "resultado garantido" ou "horário perfeito".
- Sempre cite o período/amostra e o nível de confiança que sustentam cada afirmação.
- Índice de desempenho 1,00 = igual à mediana histórica da conta.
- Métrica ausente significa indisponível na API, jamais zero.`;

export async function askIntelligence(question: string, accountId: string | null) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { answer: "A IA não está configurada neste projeto.", context: null };

  const data = await buildAccountIntelligence(accountId);
  const compact = {
    publicacoesAnalisadas: data.postsAnalyzed,
    maturidade: data.maturity,
    tendencia: data.trend,
    frequenciaSemanal: data.weeklyFrequency,
    metricasCalculadas: data.calculated,
    melhoresHorarios: data.bestSlots.map((s) => ({
      dia: DOW_LABELS[s.dow],
      hora: `${String(s.hour).padStart(2, "0")}:00`,
      indice: s.score,
      amostras: s.samples,
      confianca: s.confidence,
      viewsMedias: s.avgViews,
    })),
    horariosEvitar: data.avoidSlots.map((s) => ({
      dia: DOW_LABELS[s.dow],
      hora: `${String(s.hour).padStart(2, "0")}:00`,
      indice: s.score,
      amostras: s.samples,
    })),
    porFormato: data.byFormat,
    porDia: data.byDow,
    porDuracao: data.byDuration,
    hashtags: data.byHashtag,
    melhoresPublicacoes: data.topPosts,
    pioresPublicacoes: data.bottomPosts,
    metricasIndisponiveis: data.unavailableMetrics,
  };

  const { generateText } = await import("ai");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);

  try {
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system: SYSTEM_PROMPT,
      prompt: `Dados calculados pelo backend (JSON):\n${JSON.stringify(compact)}\n\nPergunta do usuário: ${question}`,
    });
    return { answer: text, context: { postsAnalyzed: data.postsAnalyzed, maturity: data.maturity.label } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("429")) return { answer: "Limite de uso da IA atingido. Tente novamente em instantes.", context: null };
    if (message.includes("402")) return { answer: "Os créditos de IA do projeto acabaram.", context: null };
    return { answer: "Não consegui falar com a IA agora. Tente novamente.", context: null };
  }
}
