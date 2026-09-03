import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, CheckCircle2, RefreshCw, Sparkles, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGrowthHealth, runInsightsSync } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/saude")({
  head: () => ({ meta: [
    { title: "Saúde das contas — SK7 Studio" },
    { name: "description", content: "Diagnóstico de crescimento e potencial de viralização das contas conectadas." },
    { property: "og:title", content: "Saúde das contas — SK7 Studio" },
    { property: "og:description", content: "Diagnóstico de crescimento e potencial de viralização das contas conectadas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HealthPage,
});

function scoreTone(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 65) return "text-primary";
  if (score >= 45) return "text-warning";
  return "text-destructive";
}

function HealthPage() {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["growth-health"], queryFn: () => getGrowthHealth() });
  const sync = useMutation({
    mutationFn: () => runInsightsSync(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["growth-health"] });
      toast.success("Insights atualizados e diagnóstico recalculado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao atualizar insights."),
  });
  const reports = health.data ?? [];
  const average = reports.length ? Math.round(reports.reduce((sum, item) => sum + item.score, 0) / reports.length) : 0;

  return <AppShell title="Saúde das contas" subtitle="Potencial de crescimento calculado sobre dados oficiais" actions={
    <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
      <RefreshCw className={cn("h-4 w-4", sync.isPending && "animate-spin")} />
      <span className="hidden sm:inline">Atualizar dados</span>
    </Button>
  }>
    <section className="mb-6 grid gap-4 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Growth health</p>
        <h2 className="mt-2 max-w-2xl font-display text-2xl font-semibold sm:text-3xl">Veja o que sustenta — ou limita — o crescimento de cada conta.</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">A nota combina tração, engajamento qualificado, consistência, descoberta e uso dos melhores formatos e horários. Não é promessa de viralização.</p>
      </div>
      {reports.length ? <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Média do workspace</p>
        <div className="mt-1 flex items-end gap-2"><strong className={cn("font-display text-4xl", scoreTone(average))}>{average}</strong><span className="pb-1 text-xs text-muted-foreground">/ 100</span></div>
      </div> : null}
    </section>

    {health.isLoading ? <div className="space-y-3"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div> : reports.length === 0 ? <EmptyState icon={Activity} title="Nenhuma conta para diagnosticar" description="Conecte uma conta profissional e colete os insights oficiais para gerar a primeira análise." action={<Button asChild><Link to="/configuracao">Conectar conta</Link></Button>} /> : <div className="space-y-4">
      {reports.map((report) => <article key={report.account.id} className="panel overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:p-6">
          <div className="flex gap-4 lg:block">
            <div className="relative h-28 w-28 shrink-0 lg:mx-auto lg:h-36 lg:w-36">
              <div className="absolute inset-0 rounded-full border-[10px] border-muted" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("font-display text-4xl font-semibold", scoreTone(report.score))}>{report.score}</span>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">de 100</span>
              </div>
            </div>
            <div className="min-w-0 lg:mt-4 lg:text-center">
              <div className="flex items-center gap-2 lg:justify-center">
                <Avatar className="h-7 w-7"><AvatarImage src={report.account.profile_picture_url ?? undefined} /><AvatarFallback>{report.account.username.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <p className="truncate font-semibold">@{report.account.username}</p>
              </div>
              <p className={cn("mt-2 text-sm font-semibold", scoreTone(report.score))}>{report.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Confiança {report.confidence} · {report.postsAnalyzed} posts</p>
            </div>
          </div>

          <div className="min-w-0">
            <div className="grid gap-2 sm:grid-cols-5">
              {report.dimensions.map((dimension) => <div key={dimension.key} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold">{dimension.label}</span><strong className={cn("text-sm", dimension.score === null ? "text-muted-foreground" : scoreTone(dimension.score))}>{dimension.score ?? "—"}</strong></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${dimension.score ?? 0}%` }} /></div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{dimension.summary}</p>
              </div>)}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Prioridades agora</h3>
                <ul className="mt-2 space-y-2">{report.recommendations.map((item, index) => <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span>{item}</li>)}</ul>
              </div>
              <div className="rounded-lg bg-muted/60 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-success" /> Leitura rápida</h3>
                <dl className="mt-3 space-y-2 text-[12px]"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ponto forte</dt><dd className="font-semibold">{report.strongest ?? "Em análise"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Maior oportunidade</dt><dd className="font-semibold">{report.weakest ?? "Coletar dados"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Completude</dt><dd className="font-semibold">{report.completeness}%</dd></div></dl>
                <Button asChild variant="ghost" size="sm" className="mt-3 w-full justify-between"><Link to="/ai">Explorar inteligência <ArrowRight className="h-4 w-4" /></Link></Button>
              </div>
            </div>
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/35 px-5 py-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> Somente métricas oficiais</span><span>{report.periodLabel}</span><span>Última coleta: {report.account.last_sync_at ? new Date(report.account.last_sync_at).toLocaleString("pt-BR") : "ainda não realizada"}</span></footer>
      </article>)}
    </div>}
  </AppShell>;
}