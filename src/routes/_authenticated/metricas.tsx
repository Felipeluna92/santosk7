import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Eye, Heart, Share2, MessageCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPostsMetrics } from "@/lib/meta.functions";

export const Route = createFileRoute("/_authenticated/metricas")({
  head: () => ({
    meta: [
      { title: "Métricas por post — Instagram Studio Solo" },
      {
        name: "description",
        content: "Views, curtidas e compartilhamentos de cada publicação, com gráfico do último mês.",
      },
      { property: "og:title", content: "Métricas por post — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Views, curtidas e compartilhamentos de cada publicação, com gráfico do último mês.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Metricas,
});

const nf = new Intl.NumberFormat("pt-BR");
const PERIODS = [7, 14, 30] as const;

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

function fmt(value: number | null) {
  return value === null || value === undefined ? "—" : nf.format(value);
}

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  REELS: "Reels",
  CAROUSEL_ALBUM: "Carrossel",
};

function Metricas() {
  const [days, setDays] = useState<number>(30);

  const q = useQuery({
    queryKey: ["posts-metrics", days],
    queryFn: () => getPostsMetrics({ data: { days } }),
    staleTime: 0,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });

  const posts = q.data?.posts ?? [];
  const series = q.data?.series ?? [];
  const totals = q.data?.totals;
  const errors = q.data?.errors ?? [];

  const cards = [
    { label: "Views", value: totals?.views ?? null, icon: Eye },
    { label: "Curtidas", value: totals?.likes ?? null, icon: Heart },
    { label: "Compartilhamentos", value: totals?.shares ?? null, icon: Share2 },
    { label: "Comentários", value: totals?.comments ?? null, icon: MessageCircle },
  ];

  return (
    <AppShell
      title="Métricas"
      subtitle="Desempenho de cada publicação"
      actions={
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      }
    >
      <div className="mb-4 flex w-fit rounded-md border border-border p-0.5">
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{c.label}</span>
            </div>
            {q.isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <p className="font-display text-2xl font-semibold">{fmt(c.value)}</p>
            )}
          </div>
        ))}
      </div>

      <section className="panel mt-4 p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Últimos {days} dias</h3>
          <p className="text-[11px] text-muted-foreground">Views, curtidas e compartilhamentos por dia de publicação</p>
        </div>
        {q.isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => shortDay(String(l))}
                  formatter={(v: number, n: string) => [nf.format(v), n]}
                />
                <Area type="monotone" dataKey="views" name="Views" stroke="hsl(var(--primary))" fill="url(#gViews)" strokeWidth={2} />
                <Area type="monotone" dataKey="likes" name="Curtidas" stroke="hsl(var(--chart-2, var(--primary)))" fill="none" strokeWidth={1.5} />
                <Area type="monotone" dataKey="shares" name="Compartilhamentos" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <div className="panel mt-4 border-destructive/40 p-4 text-[12px] text-muted-foreground">
          {errors.map((e) => (
            <p key={e}>• {e}</p>
          ))}
        </div>
      )}

      <section className="mt-4">
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Sem publicações no período"
            description="Conecte uma conta e publique para ver views, curtidas e compartilhamentos de cada post."
          />
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <article key={p.id} className="panel flex flex-wrap items-center gap-4 p-3">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-[10px] text-muted-foreground">
                    {TYPE_LABEL[p.mediaType] ?? p.mediaType}
                  </div>
                )}
                <div className="min-w-[180px] flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug">{p.caption || "Sem legenda"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    @{p.username} · {TYPE_LABEL[p.mediaType] ?? p.mediaType} ·{" "}
                    {p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "—"}
                  </p>
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
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
