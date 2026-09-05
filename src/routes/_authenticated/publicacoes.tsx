import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Images,
  Eye,
  Heart,
  Share2,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Flame,
} from "lucide-react";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPostsMetrics } from "@/lib/meta.functions";

export const Route = createFileRoute("/_authenticated/publicacoes")({
  head: () => ({
    meta: [
      { title: "Publicações por conta — Instagram Studio Solo" },
      {
        name: "description",
        content: "Posts publicados organizados por conta, com desempenho e potencial de cada publicação.",
      },
      { property: "og:title", content: "Publicações por conta — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Posts publicados organizados por conta, com desempenho e potencial de cada publicação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Publicacoes,
});

const nf = new Intl.NumberFormat("pt-BR");
const PERIODS = [7, 30, 90] as const;
const SORTS = [
  { key: "recent", label: "Mais recentes" },
  { key: "performance", label: "Melhor desempenho" },
  { key: "views", label: "Mais views" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  REELS: "Reels",
  CAROUSEL_ALBUM: "Carrossel",
};

function fmt(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : nf.format(value);
}

type Post = {
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

/** Interações totais = curtidas + comentários + compartilhamentos. */
function interactions(p: Post) {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
}

function Publicacoes() {
  const [days, setDays] = useState<number>(30);
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("recent");

  const q = useQuery({
    queryKey: ["posts-metrics", days],
    queryFn: () => getPostsMetrics({ data: { days } }),
    staleTime: 0,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });

  const errors = q.data?.errors ?? [];

  const groups = useMemo(() => {
    const posts = (q.data?.posts ?? []) as Post[];
    const map = new Map<string, { accountId: string; username: string; posts: Post[] }>();
    for (const p of posts) {
      const g = map.get(p.accountId) ?? { accountId: p.accountId, username: p.username, posts: [] };
      g.posts.push(p);
      map.set(p.accountId, g);
    }
    return Array.from(map.values()).map((g) => {
      const totalViews = g.posts.reduce((a, p) => a + (p.views ?? 0), 0);
      const totalInteractions = g.posts.reduce((a, p) => a + interactions(p), 0);
      const avgViews = g.posts.length ? totalViews / g.posts.length : 0;
      const avgInteractions = g.posts.length ? totalInteractions / g.posts.length : 0;
      const engagement = totalViews > 0 ? (totalInteractions / totalViews) * 100 : null;

      const scored = g.posts.map((p) => {
        const viewRatio = avgViews > 0 && p.views !== null ? p.views / avgViews : null;
        const interactionRatio = avgInteractions > 0 ? interactions(p) / avgInteractions : null;
        const parts = [viewRatio, interactionRatio].filter((v): v is number => v !== null);
        const performance = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
        const postEngagement = p.views && p.views > 0 ? (interactions(p) / p.views) * 100 : null;
        return { ...p, performance, postEngagement };
      });

      const sorted = [...scored].sort((a, b) => {
        if (sort === "views") return (b.views ?? 0) - (a.views ?? 0);
        if (sort === "performance") return (b.performance ?? 0) - (a.performance ?? 0);
        return Date.parse(b.timestamp) - Date.parse(a.timestamp);
      });

      const best = [...scored].sort((a, b) => (b.performance ?? 0) - (a.performance ?? 0))[0];

      return {
        ...g,
        posts: sorted,
        totalViews,
        totalInteractions,
        avgViews,
        engagement,
        bestId: best?.id ?? null,
      };
    });
  }, [q.data, sort]);

  return (
    <AppShell
      title="Publicações"
      subtitle="Posts publicados organizados por conta"
      actions={
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              className={`rounded px-3 py-1 text-[11px] font-medium transition-colors ${
                days === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded px-3 py-1 text-[11px] font-medium transition-colors ${
                sort === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="panel mb-4 border-destructive/40 p-4 text-[12px] text-muted-foreground">
          {errors.map((e) => (
            <p key={e}>• {e}</p>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Nenhuma publicação no período"
          description="Conecte uma conta em Configuração → Conexões e publique para acompanhar o desempenho aqui."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.accountId}>
              <header className="panel mb-2 flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="font-display text-base font-semibold">@{g.username}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {g.posts.length} {g.posts.length === 1 ? "publicação" : "publicações"} nos últimos {days} dias
                  </p>
                </div>
                <div className="flex flex-wrap gap-5 text-[12px]">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Views</p>
                    <p className="font-display text-lg font-semibold">{fmt(g.totalViews)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Interações</p>
                    <p className="font-display text-lg font-semibold">{fmt(g.totalInteractions)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Engajamento</p>
                    <p className="font-display text-lg font-semibold">
                      {g.engagement === null ? "—" : `${g.engagement.toFixed(1)}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Média/post</p>
                    <p className="font-display text-lg font-semibold">{fmt(Math.round(g.avgViews))}</p>
                  </div>
                </div>
              </header>

              <div className="space-y-2">
                {g.posts.map((p) => {
                  const perf = p.performance;
                  const above = perf !== null && perf >= 1;
                  const pct = perf === null ? null : Math.round((perf - 1) * 100);
                  return (
                    <article key={p.id} className="panel flex flex-wrap items-center gap-4 p-3">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-[10px] text-muted-foreground">
                          {TYPE_LABEL[p.mediaType] ?? p.mediaType}
                        </div>
                      )}

                      <div className="min-w-[180px] flex-1">
                        <div className="flex items-center gap-2">
                          {p.id === g.bestId && (
                            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                              <Flame className="h-3 w-3" /> Destaque
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {TYPE_LABEL[p.mediaType] ?? p.mediaType} ·{" "}
                            {p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "—"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{p.caption || "Sem legenda"}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, Math.round((perf ?? 0) * 50))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {pct === null ? (
                              "Sem base de comparação"
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {above ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {pct >= 0 ? "+" : ""}
                                {pct}% vs média da conta
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 text-[12px]">
                        <span className="flex items-center gap-1.5" title="Views">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          {fmt(p.views)}
                        </span>
                        <span className="flex items-center gap-1.5" title="Curtidas">
                          <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                          {fmt(p.likes)}
                        </span>
                        <span className="flex items-center gap-1.5" title="Compartilhamentos">
                          <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {fmt(p.shares)}
                        </span>
                        <span className="flex items-center gap-1.5" title="Comentários">
                          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          {fmt(p.comments)}
                        </span>
                        <span className="hidden text-muted-foreground sm:inline" title="Engajamento do post">
                          {p.postEngagement === null ? "—" : `${p.postEngagement.toFixed(1)}%`}
                        </span>
                        {p.permalink && (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Abrir no Instagram"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
