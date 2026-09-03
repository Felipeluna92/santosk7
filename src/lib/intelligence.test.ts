import { describe, expect, it } from "vitest";

import {
  buildHeatmap,
  buildGrowthHealth,
  confidenceFor,
  durationBucket,
  maturityFor,
  median,
  percentile,
  predictRange,
  rankBy,
  scoreMedia,
  trendOf,
  weeklyFrequency,
  type MediaRow,
} from "./intelligence";

const base: MediaRow = {
  id: "1",
  account_id: "a",
  format: "REEL",
  caption: "#teste legenda",
  hashtags: ["#teste"],
  permalink: null,
  thumbnail_url: null,
  duration_seconds: 22,
  published_at: "2026-07-01T22:00:00.000Z",
  views: 1000,
  reach: 900,
  likes: 10,
  comments: 2,
  shares: 1,
  saved: 3,
  total_interactions: 16,
};

const at = (iso: string, views: number, extra: Partial<MediaRow> = {}): MediaRow => ({
  ...base,
  id: `${iso}-${views}`,
  published_at: iso,
  views,
  ...extra,
});

describe("estatística básica", () => {
  it("calcula mediana e percentis", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
    expect(percentile([1, 2, 3, 4], 75)).toBe(3);
  });

  it("classifica confiança pelo tamanho da amostra", () => {
    expect(confidenceFor(1)).toBe("insufficient");
    expect(confidenceFor(3)).toBe("low");
    expect(confidenceFor(6)).toBe("medium");
    expect(confidenceFor(12)).toBe("high");
  });

  it("agrupa duração em faixas", () => {
    expect(durationBucket(22)).toBe("20–30s");
    expect(durationBucket(null)).toBeNull();
  });
});

describe("índice de desempenho", () => {
  it("usa a mediana da conta como base 1,00", () => {
    const { scored, baseline } = scoreMedia([at("2026-07-01T12:00:00Z", 100), at("2026-07-02T12:00:00Z", 200), at("2026-07-03T12:00:00Z", 300)]);
    expect(baseline).toBe(200);
    expect(scored.find((s) => s.views === 200)?.perf).toBe(1);
    expect(scored.find((s) => s.views === 300)?.perf).toBe(1.5);
  });

  it("converte o horário para o fuso da conta", () => {
    const { scored } = scoreMedia([at("2026-07-01T22:00:00Z", 100)]);
    expect(scored[0]?.hour).toBe(19); // 22h UTC = 19h em São Paulo
  });
});

describe("mapa de calor", () => {
  it("marca amostra insuficiente e suaviza células pequenas", () => {
    const rows = [at("2026-07-01T22:00:00Z", 100), at("2026-07-08T22:00:00Z", 300)];
    const { scored } = scoreMedia(rows);
    const cells = buildHeatmap(scored);
    const cell = cells.find((c) => c.samples > 0)!;
    expect(cell.confidence).toBe("insufficient");
    // 2 amostras com perf 0,5 e 1,5 => suavizado para exatamente 1,00
    expect(cell.score).toBeCloseTo(1, 5);
  });

  it("não cria célula fora da grade semanal", () => {
    expect(buildHeatmap([])).toHaveLength(7 * 24);
  });
});

describe("rankings e maturidade", () => {
  it("ordena formatos pelo índice suavizado", () => {
    const rows = [
      at("2026-07-01T12:00:00Z", 1000, { format: "REEL" }),
      at("2026-07-02T12:00:00Z", 1000, { format: "REEL" }),
      at("2026-07-03T12:00:00Z", 100, { format: "POST" }),
    ];
    const { scored } = scoreMedia(rows);
    const ranked = rankBy(scored, (s) => s.format);
    expect(ranked[0]?.key).toBe("REEL");
  });

  it("indica quantas publicações faltam para o próximo estágio", () => {
    expect(maturityFor(2)).toMatchObject({ stage: "insufficient", postsToNextStage: 3 });
    expect(maturityFor(80).postsToNextStage).toBeNull();
  });
});

describe("tendência e frequência", () => {
  const now = new Date("2026-08-01T12:00:00Z").getTime();

  it("detecta queda de desempenho", () => {
    const rows = [at("2026-07-28T12:00:00Z", 100), at("2026-07-10T12:00:00Z", 1000)];
    const { scored } = scoreMedia(rows);
    expect(trendOf(scored, now).direction).toBe("down");
  });

  it("calcula publicações por semana", () => {
    const rows = [at("2026-07-28T12:00:00Z", 100), at("2026-07-26T12:00:00Z", 100)];
    const { scored } = scoreMedia(rows);
    expect(weeklyFrequency(scored, now)).toBe(0.5);
  });
});

describe("previsão", () => {
  it("não prevê com menos de 3 comparáveis", () => {
    expect(predictRange([100, 200])).toBeNull();
  });

  it("devolve faixa em vez de número único", () => {
    const range = predictRange([100, 200, 300, 400])!;
    expect(range.low).toBeLessThan(range.high);
    expect(range.confidence).toBe("low");
  });
});

describe("saúde de crescimento", () => {
  it("mantém a nota entre 0 e 100 e informa a confiança", () => {
    const report = buildGrowthHealth({
      postsAnalyzed: 24,
      postsCollected: 24,
      trend: { direction: "up", changePct: 18 },
      weeklyFrequency: 4,
      followers: 1000,
      medianViews: 1400,
      engagementPerReach: 0.06,
      savesPerReach: 0.015,
      sharesPerReach: 0.012,
      viewsPerFollower: 1.4,
      bestFormatScore: 1.3,
      bestSlotScore: 1.2,
    });
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.confidence).toBe("alta");
    expect(report.dimensions).toHaveLength(5);
  });

  it("não transforma métricas ausentes em zero", () => {
    const report = buildGrowthHealth({
      postsAnalyzed: 0,
      postsCollected: 0,
      trend: { direction: "unknown", changePct: null },
      weeklyFrequency: null,
      followers: null,
      medianViews: null,
      engagementPerReach: null,
      savesPerReach: null,
      sharesPerReach: null,
      viewsPerFollower: null,
      bestFormatScore: null,
      bestSlotScore: null,
    });
    expect(report.dimensions.every((dimension) => dimension.score === null)).toBe(true);
    expect(report.confidence).toBe("inicial");
  });
});
