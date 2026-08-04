import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CalendarDays,
  Film,
  Timer,
  Send,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery } from "@/lib/data";
import { askAi, getIntelligence, getLastSync, runInsightsSync } from "@/lib/ai.functions";
import { DOW_LABELS } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "AI Cálica — Inteligência de conteúdo" },
      {
        name: "description",
        content:
          "Inteligência de conteúdo que aprende com o histórico real de cada conta: melhor horário, formato, duração e previsões com nível de confiança.",
      },
      { property: "og:title", content: "AI Cálica — Inteligência de conteúdo" },
      {
        property: "og:description",
        content: "Recomendações de horário, formato e duração calculadas sobre os insights oficiais das suas contas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiPage,
});

const nf = new Intl.NumberFormat("pt-BR");
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const CONFIDENCE_LABEL: Record<string, string> = {
  insufficient: "amostra insuficiente",
  low: "confiança baixa",
  medium: "confiança moderada",
  high: "confiança alta",
};

function Tag({ kind }: { kind: "oficial" | "calculada" | "previsao" | "recomendacao" | "indisponivel" }) {
  const map = {
    oficial: ["Métrica oficial", "bg-info/15 text-[color:var(--info)]"],
    calculada: ["Métrica calculada", "bg-secondary text-secondary-foreground"],
    previsao: ["Previsão da IA", "bg-warning/15 text-warning"],
    recomendacao: ["Recomendação", "bg-primary/15 text-primary"],
    indisponivel: ["Indisponível", "bg-muted text-muted-foreground"],
  } as const;
  const [label, tone] = map[kind];
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>{label}</span>;
}

function Stat({
  label,
  value,
  hint,
  tag,
}: {
  label: string;
  value: string;
  hint?: string;
  tag?: "oficial" | "calculada" | "previsao" | "recomendacao" | "indisponivel";
}) {
  return (
    <div className="panel min-w-0 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {tag ? <Tag kind={tag} /> : null}
      </div>
      <p className="truncate font-display text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AiPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const accounts = useQuery(accountsQuery);
  const lastSync = useQuery({ queryKey: ["last-sync"], queryFn: () => getLastSync() });
  const intel = useQuery({
    queryKey: ["intelligence", accountId],
    queryFn: () => getIntelligence({ data: { accountId } }),
  });

  const sync = useMutation({
    mutationFn: () => runInsightsSync(),
    onSuccess: async (res) => {
      toast.success(`Coleta concluída: ${res.media_upserted} publicações, ${res.snapshots_written} snapshots.`);
      await intel.refetch();
      await lastSync.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na coleta."),
  });

  const ask = useMutation({
    mutationFn: (q: string) => askAi({ data: { question: q, accountId } }),
    onSuccess: (res) => setAnswer(res.answer),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao consultar a IA."),
  });

  const d = intel.data;
  const maxScore = useMemo(
    () => Math.max(1, ...(d?.heatmap ?? []).filter((c) => c.samples > 0).map((c) => c.score ?? 0)),
    [d],
  );

  const trendIcon =
    d?.trend.direction === "up" ? TrendingUp : d?.trend.direction === "down" ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <AppShell title="AI Cálica" subtitle="Inteligência de conteúdo baseada no histórico real das suas contas">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <button
            onClick={() => setAccountId(null)}
            className={cn(
              "rounded-lg border border-border px-2.5 py-1.5 text-[12px]",
              accountId === null ? "bg-primary/15 text-primary" : "text-muted-foreground",
            )}
          >
            Todas as contas
          </button>
          {(accounts.data ?? []).map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountId(a.id)}
              className={cn(
                "rounded-lg border border-border px-2.5 py-1.5 text-[12px]",
                accountId === a.id ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              @{a.username}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Coletando..." : "Coletar insights agora"}
        </Button>
      </div>

      {intel.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !d ? (
        <p className="panel p-6 text-center text-xs text-muted-foreground">Não foi possível carregar a análise.</p>
      ) : d.postsAnalyzed === 0 ? (
        <div className="panel p-6 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" />
          <p className="text-sm font-medium">Ainda não há histórico coletado</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Clique em “Coletar insights agora” para buscar as publicações e métricas oficiais das contas
            conectadas. A coleta também roda sozinha a cada hora e a análise melhora a cada publicação.
          </p>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Maturidade do modelo"
              value={d.maturity.label}
              tag="calculada"
              hint={
                d.maturity.postsToNextStage
                  ? `${d.postsAnalyzed} publicações analisadas · faltam ${d.maturity.postsToNextStage} para o próximo nível`
                  : `${d.postsAnalyzed} publicações analisadas`
              }
            />
            <Stat
              label="Tendência (14 vs 14 dias)"
              value={
                d.trend.changePct === null
                  ? "Sem base suficiente"
                  : `${d.trend.changePct > 0 ? "+" : ""}${d.trend.changePct.toFixed(0)}%`
              }
              tag="calculada"
              hint={
                d.trend.direction === "up"
                  ? "Crescendo em relação às duas semanas anteriores"
                  : d.trend.direction === "down"
                    ? "Perdendo desempenho em relação às duas semanas anteriores"
                    : "Estável"
              }
            />
            <Stat
              label="Mediana de views"
              value={d.calculated.medianViews !== null ? nf.format(Math.round(d.calculated.medianViews)) : "—"}
              tag={d.calculated.medianViews !== null ? "oficial" : "indisponivel"}
              hint="Base do índice de desempenho (1,00 = igual à mediana)"
            />
            <Stat
              label="Frequência atual"
              value={d.weeklyFrequency !== null ? `${d.weeklyFrequency} posts/semana` : "—"}
              tag="calculada"
              hint="Média das últimas 4 semanas"
            />
          </div>

          <section className="panel mt-3 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Clock className="h-4 w-4" /> Mapa de calor semanal
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Índice de desempenho por dia e hora (fuso de São Paulo), suavizado para evitar conclusão com
                  poucas amostras.
                </p>
              </div>
              <TrendIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[620px]">
                <div className="mb-1 grid grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-[2px]">
                  <span />
                  {HOURS.map((h) => (
                    <span key={h} className="text-center text-[8px] text-muted-foreground">
                      {h % 3 === 0 ? h : ""}
                    </span>
                  ))}
                </div>
                {DOW_LABELS.map((label, dow) => (
                  <div key={label} className="mb-[2px] grid grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-[2px]">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    {HOURS.map((h) => {
                      const cell = d.heatmap.find((c) => c.dow === dow && c.hour === h);
                      const intensity =
                        cell && cell.samples > 0 && cell.score !== null ? cell.score / maxScore : 0;
                      return (
                        <div
                          key={h}
                          title={
                            cell && cell.samples > 0
                              ? `${label} ${String(h).padStart(2, "0")}:00 · índice ${cell.score?.toFixed(2)} · ${cell.samples} publicação(ões) · ${CONFIDENCE_LABEL[cell.confidence]}`
                              : `${label} ${String(h).padStart(2, "0")}:00 · sem publicações`
                          }
                          className="h-5 rounded-[3px] border border-border/40"
                          style={{
                            background:
                              intensity > 0
                                ? `color-mix(in oklab, var(--primary) ${Math.round(18 + intensity * 78)}%, transparent)`
                                : "var(--muted)",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
                  Melhores horários <Tag kind="recomendacao" />
                </p>
                {d.bestSlots.length ? (
                  <ul className="space-y-1.5">
                    {d.bestSlots.map((s) => (
                      <li
                        key={`${s.dow}-${s.hour}`}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 text-[12px]"
                      >
                        <span>
                          {DOW_LABELS[s.dow]} às {String(s.hour).padStart(2, "0")}:00
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          índice {s.score?.toFixed(2)} · {s.samples} post(s) · {CONFIDENCE_LABEL[s.confidence]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Ainda não existem dados suficientes para uma recomendação altamente confiável. Esta análise usa
                    o histórico disponível e vai melhorar com novas publicações.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-semibold">Horários com desempenho abaixo da média</p>
                {d.avoidSlots.length ? (
                  <ul className="space-y-1.5">
                    {d.avoidSlots.map((s) => (
                      <li
                        key={`${s.dow}-${s.hour}`}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 text-[12px]"
                      >
                        <span>
                          {DOW_LABELS[s.dow]} às {String(s.hour).padStart(2, "0")}:00
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          índice {s.score?.toFixed(2)} · {s.samples} post(s)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Amostra insuficiente para apontar horários fracos.</p>
                )}
              </div>
            </div>
          </section>

          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
            <RankPanel title="Formatos" icon={Film} items={d.byFormat} />
            <RankPanel title="Dias da semana" icon={CalendarDays} items={d.byDow} />
            <RankPanel title="Duração do Reel" icon={Timer} items={d.byDuration} empty="A API oficial não retorna a duração do vídeo para estas contas." />
          </div>

          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
            <PostsPanel title="Melhores publicações" posts={d.topPosts} />
            <PostsPanel title="Publicações abaixo da média" posts={d.bottomPosts} />
          </div>

          <section className="panel mt-3 p-5">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Pergunte à sua IA
            </h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              As respostas usam apenas os números calculados acima ({d.postsAnalyzed} publicações analisadas ·{" "}
              {d.maturity.label}). Nenhum token ou dado sensível é enviado ao modelo.
            </p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                const q = question.trim();
                if (!q) return;
                ask.mutate(q);
              }}
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Que tipo de Reel devo postar hoje?"
                maxLength={800}
              />
              <Button type="submit" size="sm" disabled={ask.isPending}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {ask.isPending ? "Analisando..." : "Perguntar"}
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                "Qual é o melhor horário desta conta?",
                "Quais conteúdos devo repetir?",
                "Por que as visualizações caíram?",
                "Monte um calendário para a próxima semana.",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setQuestion(q);
                    ask.mutate(q);
                  }}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
            {ask.isPending ? <Skeleton className="mt-3 h-24 rounded-lg" /> : null}
            {answer && !ask.isPending ? (
              <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed">
                {answer}
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="panel mt-3 flex gap-2.5 border-warning/25 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-[12px] leading-relaxed text-muted-foreground">
          <p>
            Todas as recomendações são estimativas calculadas sobre o histórico das suas próprias contas. O
            Instagram não expõe o funcionamento do algoritmo, resultados passados não garantem resultados futuros
            e algumas métricas variam conforme conta, mídia, permissão e versão da API. Métrica ausente significa
            indisponível — nunca zero.
          </p>
          {lastSync.data ? (
            <p className="mt-1.5">
              Última coleta: {new Date(lastSync.data.started_at).toLocaleString("pt-BR")} ·{" "}
              {lastSync.data.media_upserted} publicações · {lastSync.data.errors} erro(s).
            </p>
          ) : null}
          {d?.unavailableMetrics?.length ? (
            <p className="mt-1.5">
              Métricas indisponíveis nesta amostra: {d.unavailableMetrics.join(", ")}.
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function RankPanel({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof Film;
  items: { key: string; samples: number; score: number; avgViews: number | null }[];
  empty?: string;
}) {
  return (
    <div className="panel min-w-0 p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4" /> {title}
      </h3>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">{i.key}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {i.score.toFixed(2)} · {i.samples} post(s)
                {i.avgViews !== null ? ` · ${nf.format(Math.round(i.avgViews))} views` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{empty ?? "Sem dados suficientes."}</p>
      )}
    </div>
  );
}

function PostsPanel({
  title,
  posts,
}: {
  title: string;
  posts: {
    id: string;
    permalink: string | null;
    thumbnail: string | null;
    format: string;
    views: number | null;
    perf: number | null;
    publishedAt: string | null;
    caption: string | null;
  }[];
}) {
  return (
    <div className="panel min-w-0 p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {posts.length ? (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2.5">
              {p.thumbnail ? (
                <img
                  src={p.thumbnail}
                  alt={p.caption ?? "Publicação do Instagram"}
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px]">{p.caption || "Sem legenda"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {p.format} · {p.views !== null ? `${nf.format(p.views)} views` : "views indisponíveis"} · índice{" "}
                  {p.perf?.toFixed(2) ?? "—"}
                </p>
              </div>
              {p.permalink ? (
                <a
                  href={p.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] text-primary hover:underline"
                >
                  abrir
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Sem dados suficientes.</p>
      )}
    </div>
  );
}
