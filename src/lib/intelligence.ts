// Pure, testable statistics for the AI Cálica module.
// Nenhuma métrica é inventada aqui: só cálculos sobre o que a API oficial devolveu.

export type MediaRow = {
  id: string;
  account_id: string;
  format: string;
  caption: string | null;
  hashtags: string[];
  permalink: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  total_interactions: number | null;
};

export const TIMEZONE = "America/Sao_Paulo";
export const MIN_SAMPLE = 3;
/** Força da suavização bayesiana: puxa amostras pequenas para a média da conta. */
export const SHRINKAGE = 3;

export const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export function mean(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function percentile(values: number[], p: number): number | null {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
  return v[idx]!;
}

/** Dia da semana e hora locais (fuso da conta), a partir de um ISO UTC. */
export function localParts(iso: string, timeZone = TIMEZONE) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: map[wd] ?? 0, hour: Number(hourRaw) % 24 };
}

export type Scored = MediaRow & { perf: number | null; dow: number; hour: number };

/**
 * Índice de desempenho = views da publicação ÷ mediana de views da conta.
 * 1,00 significa desempenho igual à mediana histórica da própria conta.
 */
export function scoreMedia(rows: MediaRow[], timeZone = TIMEZONE): { scored: Scored[]; baseline: number | null } {
  const withViews = rows.filter((r) => typeof r.views === "number" && r.published_at);
  const baseline = median(withViews.map((r) => r.views as number));
  const scored = rows
    .filter((r) => r.published_at)
    .map((r) => {
      const { dow, hour } = localParts(r.published_at as string, timeZone);
      const perf = baseline && baseline > 0 && typeof r.views === "number" ? r.views / baseline : null;
      return { ...r, perf, dow, hour };
    });
  return { scored, baseline };
}

export type HeatCell = {
  dow: number;
  hour: number;
  samples: number;
  score: number | null;
  avgViews: number | null;
  confidence: "insufficient" | "low" | "medium" | "high";
};

export function confidenceFor(n: number): HeatCell["confidence"] {
  if (n < MIN_SAMPLE) return "insufficient";
  if (n < 5) return "low";
  if (n < 8) return "medium";
  return "high";
}

/** Mapa de calor semanal com suavização: célula com poucas amostras é puxada para 1,00. */
export function buildHeatmap(scored: Scored[]): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const bucket = scored.filter((s) => s.dow === dow && s.hour === hour && s.perf !== null);
      const n = bucket.length;
      const sum = bucket.reduce((a, b) => a + (b.perf as number), 0);
      cells.push({
        dow,
        hour,
        samples: n,
        score: n ? (sum + SHRINKAGE * 1) / (n + SHRINKAGE) : null,
        avgViews: mean(bucket.map((b) => b.views as number)),
        confidence: confidenceFor(n),
      });
    }
  }
  return cells;
}

export type Ranked = { key: string; samples: number; score: number; avgViews: number | null };

export function rankBy(scored: Scored[], keyOf: (s: Scored) => string | null): Ranked[] {
  const groups = new Map<string, Scored[]>();
  for (const s of scored) {
    if (s.perf === null) continue;
    const k = keyOf(s);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      samples: items.length,
      score: (items.reduce((a, b) => a + (b.perf as number), 0) + SHRINKAGE) / (items.length + SHRINKAGE),
      avgViews: mean(items.map((i) => i.views as number)),
    }))
    .sort((a, b) => b.score - a.score);
}

export function durationBucket(seconds: number | null): string | null {
  if (typeof seconds !== "number" || seconds <= 0) return null;
  if (seconds < 10) return "0–10s";
  if (seconds < 20) return "10–20s";
  if (seconds < 30) return "20–30s";
  if (seconds < 45) return "30–45s";
  if (seconds < 60) return "45–60s";
  if (seconds < 90) return "60–90s";
  return "90s+";
}

export type Maturity = {
  stage: "insufficient" | "initial" | "intermediate" | "reliable" | "advanced";
  label: string;
  postsAnalyzed: number;
  postsToNextStage: number | null;
};

export function maturityFor(n: number): Maturity {
  if (n < 5)
    return { stage: "insufficient", label: "Dados insuficientes", postsAnalyzed: n, postsToNextStage: 5 - n };
  if (n < 15)
    return { stage: "initial", label: "Aprendizado inicial", postsAnalyzed: n, postsToNextStage: 15 - n };
  if (n < 30)
    return { stage: "intermediate", label: "Aprendizado intermediário", postsAnalyzed: n, postsToNextStage: 30 - n };
  if (n < 60)
    return { stage: "reliable", label: "Modelo confiável", postsAnalyzed: n, postsToNextStage: 60 - n };
  return { stage: "advanced", label: "Modelo avançado", postsAnalyzed: n, postsToNextStage: null };
}

export type Trend = { direction: "up" | "flat" | "down" | "unknown"; changePct: number | null };

/** Compara a mediana de views das últimas 2 semanas com as 2 anteriores. */
export function trendOf(scored: Scored[], now = Date.now()): Trend {
  const day = 86_400_000;
  const recent = scored.filter(
    (s) => s.views !== null && now - new Date(s.published_at as string).getTime() <= 14 * day,
  );
  const prev = scored.filter((s) => {
    if (s.views === null) return false;
    const age = now - new Date(s.published_at as string).getTime();
    return age > 14 * day && age <= 28 * day;
  });
  const a = median(recent.map((r) => r.views as number));
  const b = median(prev.map((r) => r.views as number));
  if (a === null || b === null || b === 0) return { direction: "unknown", changePct: null };
  const change = ((a - b) / b) * 100;
  return { direction: change > 8 ? "up" : change < -8 ? "down" : "flat", changePct: change };
}

/** Publicações por semana nas últimas 4 semanas. */
export function weeklyFrequency(scored: Scored[], now = Date.now()): number | null {
  const day = 86_400_000;
  const recent = scored.filter((s) => now - new Date(s.published_at as string).getTime() <= 28 * day);
  if (!recent.length) return null;
  return Number((recent.length / 4).toFixed(1));
}

export type GrowthHealthInput = {
  postsAnalyzed: number;
  postsCollected: number;
  trend: Trend;
  weeklyFrequency: number | null;
  followers: number | null;
  medianViews: number | null;
  engagementPerReach: number | null;
  savesPerReach: number | null;
  sharesPerReach: number | null;
  viewsPerFollower: number | null;
  bestFormatScore: number | null;
  bestSlotScore: number | null;
};

export type GrowthHealthDimension = {
  key: "traction" | "engagement" | "consistency" | "discovery" | "optimization";
  label: string;
  score: number | null;
  weight: number;
  summary: string;
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const scaled = (value: number | null, ceiling: number) =>
  value === null ? null : clampScore((Math.max(0, value) / ceiling) * 100);

export function buildGrowthHealth(input: GrowthHealthInput) {
  const traction = input.trend.changePct === null
    ? null
    : clampScore(50 + Math.max(-50, Math.min(50, input.trend.changePct)));

  const engagementParts = [
    scaled(input.engagementPerReach, 0.08),
    scaled(input.savesPerReach, 0.02),
    scaled(input.sharesPerReach, 0.02),
  ].filter((value): value is number => value !== null);
  const engagement = engagementParts.length
    ? clampScore(engagementParts.reduce((sum, value) => sum + value, 0) / engagementParts.length)
    : null;

  const consistency = input.weeklyFrequency === null
    ? null
    : input.weeklyFrequency < 1
      ? clampScore(input.weeklyFrequency * 40)
      : input.weeklyFrequency <= 3
        ? clampScore(40 + ((input.weeklyFrequency - 1) / 2) * 50)
        : input.weeklyFrequency <= 7
          ? 100
          : clampScore(100 - Math.min(25, (input.weeklyFrequency - 7) * 4));

  const discoveryParts = [
    scaled(input.viewsPerFollower, 1.5),
    input.medianViews !== null && input.followers !== null && input.followers > 0
      ? scaled(input.medianViews / input.followers, 1.5)
      : null,
  ].filter((value): value is number => value !== null);
  const discovery = discoveryParts.length
    ? clampScore(discoveryParts.reduce((sum, value) => sum + value, 0) / discoveryParts.length)
    : null;

  const optimizationParts = [input.bestFormatScore, input.bestSlotScore]
    .filter((value): value is number => value !== null)
    .map((value) => clampScore((value / 1.35) * 100));
  const optimization = optimizationParts.length
    ? clampScore(optimizationParts.reduce((sum, value) => sum + value, 0) / optimizationParts.length)
    : null;

  const dimensions: GrowthHealthDimension[] = [
    { key: "traction", label: "Tração", score: traction, weight: 25, summary: traction === null ? "Colete ao menos 28 dias para medir evolução." : traction >= 70 ? "O alcance recente está ganhando força." : traction >= 45 ? "O desempenho está estável, com espaço para acelerar." : "A performance recente perdeu força." },
    { key: "engagement", label: "Engajamento qualificado", score: engagement, weight: 25, summary: engagement === null ? "Alcance e interações ainda não estão disponíveis." : engagement >= 70 ? "O conteúdo gera sinais fortes de valor e compartilhamento." : engagement >= 45 ? "As pessoas interagem, mas poucos conteúdos viram referência." : "Salvamentos e compartilhamentos precisam crescer." },
    { key: "consistency", label: "Consistência", score: consistency, weight: 15, summary: consistency === null ? "Ainda não há quatro semanas de atividade mensurável." : consistency >= 75 ? "A cadência atual sustenta aprendizado e distribuição." : "A frequência atual limita o aprendizado da conta." },
    { key: "discovery", label: "Descoberta", score: discovery, weight: 20, summary: discovery === null ? "Seguidores e visualizações são necessários para este diagnóstico." : discovery >= 70 ? "O conteúdo alcança além da base atual." : discovery >= 45 ? "A descoberta existe, mas ainda é irregular." : "Poucas visualizações chegam fora da base atual." },
    { key: "optimization", label: "Formato e horário", score: optimization, weight: 15, summary: optimization === null ? "Publique mais para identificar padrões confiáveis." : optimization >= 70 ? "A conta já possui formatos e janelas com vantagem clara." : "Ainda há espaço para concentrar esforços no que performa melhor." },
  ];

  const available = dimensions.filter((dimension) => dimension.score !== null);
  const weightTotal = available.reduce((sum, dimension) => sum + dimension.weight, 0);
  const score = weightTotal
    ? clampScore(available.reduce((sum, dimension) => sum + (dimension.score as number) * dimension.weight, 0) / weightTotal)
    : 0;
  const completeness = clampScore((available.length / dimensions.length) * 70 + Math.min(30, input.postsAnalyzed));
  const confidence = completeness >= 85 ? "alta" : completeness >= 60 ? "moderada" : completeness >= 35 ? "baixa" : "inicial";

  const strongest = available.slice().sort((a, b) => (b.score as number) - (a.score as number))[0];
  const weakest = available.slice().sort((a, b) => (a.score as number) - (b.score as number))[0];
  const recommendations: string[] = [];
  if (consistency !== null && consistency < 70) recommendations.push("Estabeleça uma cadência sustentável de 3 a 5 publicações por semana durante 30 dias.");
  if (engagement !== null && engagement < 70) recommendations.push("Crie conteúdos utilitários e compartilháveis, com promessa clara nos primeiros segundos e CTA específico para salvar ou enviar.");
  if (discovery !== null && discovery < 70) recommendations.push("Priorize Reels derivados dos temas que já superaram a mediana da conta e teste novas aberturas sobre o mesmo assunto.");
  if (traction !== null && traction < 50) recommendations.push("Recupere os temas dos melhores conteúdos e publique uma nova variação antes de ampliar o volume.");
  if (optimization !== null && optimization < 70) recommendations.push("Concentre os próximos testes nos dois formatos e horários mais fortes do histórico, alterando apenas uma variável por vez.");
  if (!recommendations.length) recommendations.push("Mantenha a cadência e transforme os melhores conteúdos em séries para ampliar a repetibilidade do resultado.");
  if (input.postsAnalyzed < 15) recommendations.push(`Colete mais ${15 - input.postsAnalyzed} publicação(ões) para elevar a confiança do diagnóstico.`);

  return {
    score,
    label: score >= 80 ? "Potencial forte" : score >= 65 ? "Boa base" : score >= 45 ? "Em desenvolvimento" : "Base frágil",
    confidence,
    completeness,
    dimensions,
    strongest: strongest?.label ?? null,
    weakest: weakest?.label ?? null,
    recommendations: recommendations.slice(0, 4),
  };
}

export function bestSlots(cells: HeatCell[], limit = 3) {
  return cells
    .filter((c) => c.samples >= MIN_SAMPLE && c.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, limit);
}

export function worstSlots(cells: HeatCell[], limit = 2) {
  return cells
    .filter((c) => c.samples >= MIN_SAMPLE && c.score !== null)
    .sort((a, b) => (a.score as number) - (b.score as number))
    .slice(0, limit);
}

/** Faixa de previsão a partir de publicações comparáveis do próprio histórico. */
export function predictRange(comparables: number[]) {
  if (comparables.length < 3) return null;
  const low = percentile(comparables, 25);
  const mid = median(comparables);
  const high = percentile(comparables, 75);
  if (low === null || mid === null || high === null) return null;
  return {
    low: Math.round(low),
    mid: Math.round(mid),
    high: Math.round(high),
    samples: comparables.length,
    confidence: confidenceFor(comparables.length),
  };
}
