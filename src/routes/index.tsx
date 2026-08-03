import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Clock, Sparkles, ArrowUpRight, Eye, Users, CheckCircle2 } from "lucide-react";

import { AppShell, DemoBanner } from "@/components/AppShell";
import { InsightsChart } from "@/components/InsightsChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery, postsQuery, fmtDate, POST_STATUS, POST_TYPE_LABEL } from "@/lib/data";
import { demoAccounts, demoPosts } from "@/lib/demo";
import { getAccountsInsights } from "@/lib/meta.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Instagram Studio Solo" },
      {
        name: "description",
        content: "Visão geral de contas conectadas, publicações, agendamentos e falhas recentes.",
      },
      { property: "og:title", content: "Painel — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Visão geral de contas conectadas, publicações, agendamentos e falhas recentes.",
      },
    ],
  }),
  component: Dashboard,
});

const nf = new Intl.NumberFormat("pt-BR");

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof AtSign;
}) {
  return (
    <div className="panel-glow relative overflow-hidden px-4 py-5 sm:px-5 sm:py-6">
      <span className="absolute inset-y-4 left-0 w-[3px] rounded-full bg-[image:var(--gradient-brand)]" />
      <div className="flex items-start justify-between">
        <p className="text-[12px] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <p className="brand-gradient-text mt-2 font-display text-2xl font-semibold tracking-tight sm:mt-3 sm:text-4xl">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const accounts = useQuery(accountsQuery);
  const posts = useQuery(postsQuery);
  const insights = useQuery({ queryKey: ["accounts-insights"], queryFn: () => getAccountsInsights() });

  const loading = accounts.isLoading || posts.isLoading;
  const isDemo = !loading && (accounts.data?.length ?? 0) === 0;

  const accountList = isDemo ? demoAccounts : (accounts.data ?? []);
  const postList = isDemo ? demoPosts : (posts.data ?? []);

  const published = postList.filter((p) => p.status === "published").length;
  const scheduled = postList.filter((p) => p.status === "scheduled").length;
  const lastSync = accountList.map((a) => a.last_sync_at).filter(Boolean).sort().reverse()[0];

  const today = new Date().toDateString();
  const postsToday = postList.filter(
    (p) => p.published_at && new Date(p.published_at).toDateString() === today,
  ).length;

  type InsightRow = {
    accountId: string;
    username: string;
    followers: number | null;
    mediaCount: number | null;
    views: number | null;
  };
  const rows: InsightRow[] = (insights.data as InsightRow[] | undefined) ?? [];
  const totalViews = rows.reduce((a, r) => a + (r.views ?? 0), 0);
  const totalFollowers = rows.reduce((a, r) => a + (r.followers ?? 0), 0);
  const hasInsights = rows.some((r) => r.followers !== null || r.views !== null);

  return (
    <AppShell title="Painel" subtitle="Sua operação em um único fluxo">
      {isDemo ? <DemoBanner /> : null}

      <section className="panel-glow mb-4 px-6 py-9">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Painel operacional</p>
        <h2 className="mt-3 max-w-lg font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          O que está <span className="brand-gradient-text">acontecendo agora</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {accountList.length} conta(s) em um único fluxo · atualizado {fmtDate(lastSync)}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link to="/composer">
              <Sparkles className="h-4 w-4" /> Nova publicação
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="rounded-full px-6">
            <Link to="/calendario">Ver agenda</Link>
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Views registradas"
            value={insights.isLoading ? "…" : hasInsights ? nf.format(totalViews) : "—"}
            hint={hasInsights ? "Últimas 24 horas" : "Métrica indisponível para esta conta"}
            icon={Eye}
          />
          <MetricCard
            label="Seguidores"
            value={insights.isLoading ? "…" : hasInsights ? nf.format(totalFollowers) : "—"}
            hint={`${rows.length || accountList.length} conta(s) monitorada(s)`}
            icon={Users}
          />
          <MetricCard
            label="Posts hoje"
            value={postsToday}
            hint={`${published} publicados no total`}
            icon={CheckCircle2}
          />
          <MetricCard
            label="Na fila"
            value={scheduled}
            hint={scheduled ? "Aguardando horário agendado" : "Nada agendado"}
            icon={Clock}
          />
        </div>
      )}

      <InsightsChart />


      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Próximos e recentes</h3>
            <Link to="/historico" className="text-xs text-muted-foreground hover:text-foreground">
              Ver histórico <ArrowUpRight className="inline h-3 w-3" />
            </Link>
          </div>
          {postList.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Nenhuma publicação ainda. Comece criando uma nova.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {postList.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{p.caption || "Sem legenda"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {POST_TYPE_LABEL[p.type] ?? p.type} ·{" "}
                      {fmtDate(p.published_at ?? p.scheduled_at ?? p.created_at)}
                    </p>
                  </div>
                  <Badge className={`shrink-0 border-0 ${POST_STATUS[p.status]?.tone}`}>
                    {POST_STATUS[p.status]?.label ?? p.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Contas</h3>
          <ul className="space-y-2.5">
            {accountList.slice(0, 5).map((a) => {
              const row = rows.find((r) => r.username === a.username);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px]">@{a.username}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {row?.views !== null && row?.views !== undefined ? `${nf.format(row.views)} views` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button asChild variant="secondary" size="sm" className="mt-4 w-full rounded-full">
            <Link to="/contas">Gerenciar contas</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
