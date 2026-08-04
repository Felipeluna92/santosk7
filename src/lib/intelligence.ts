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
