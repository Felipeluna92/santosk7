import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AtSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

import { AppShell, DemoBanner } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery, postsQuery, logsQuery, fmtDate, POST_STATUS, POST_TYPE_LABEL } from "@/lib/data";
import { demoAccounts, demoPosts, demoLogs } from "@/lib/demo";
import { getMetaStatus } from "@/lib/meta.functions";

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

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "text-foreground",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof AtSign;
  tone?: string;
}) {
  return (
    <div className="panel-glow px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="brand-gradient-bg flex h-7 w-7 items-center justify-center rounded-lg">
          <Icon className="h-3.5 w-3.5 text-primary-foreground" />
        </span>
      </div>
      <p className={`mt-2.5 font-display text-3xl font-semibold tracking-tight ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const nf = new Intl.NumberFormat("pt-BR");

function Dashboard() {
  const accounts = useQuery(accountsQuery);
  const posts = useQuery(postsQuery);
  const logs = useQuery(logsQuery);
  const meta = useQuery({ queryKey: ["meta-status"], queryFn: () => getMetaStatus() });
  const insights = useQuery({ queryKey: ["accounts-insights"], queryFn: () => getAccountsInsights() });

  const loading = accounts.isLoading || posts.isLoading;
  const isDemo = !loading && (accounts.data?.length ?? 0) === 0;

  const accountList = isDemo ? demoAccounts : (accounts.data ?? []);
  const postList = isDemo ? demoPosts : (posts.data ?? []);
  const logList = isDemo ? demoLogs : (logs.data ?? []);

  const published = postList.filter((p) => p.status === "published").length;
  const scheduled = postList.filter((p) => p.status === "scheduled").length;
  const failed = postList.filter((p) => p.status === "failed");
  const lastSync = accountList.map((a) => a.last_sync_at).filter(Boolean).sort().reverse()[0];

  const today = new Date().toDateString();
  const postsToday = postList.filter(
    (p) => p.published_at && new Date(p.published_at).toDateString() === today,
  ).length;

  const rows = insights.data ?? [];
  const totalViews = rows.reduce((a, r) => a + (r.views ?? 0), 0);
  const totalFollowers = rows.reduce((a, r) => a + (r.followers ?? 0), 0);
  const hasInsights = rows.some((r) => r.followers !== null || r.views !== null);

  return (
    <AppShell
      title="Painel"
      subtitle="Resumo operacional da sua operação solo"
      actions={
        <Button asChild size="sm">
          <Link to="/composer">
            <Sparkles className="h-4 w-4" /> Criar publicação
          </Link>
        </Button>
      }
    >
      {isDemo ? <DemoBanner /> : null}

      <div className="panel-glow mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div>
          <h2 className="brand-gradient-text font-display text-2xl font-semibold">Olá, santosk7</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {accountList.length} conta(s) conectada(s) · última sincronização {fmtDate(lastSync)}
          </p>
        </div>
        <Badge className="border-0 bg-primary/15 text-primary">APIs oficiais da Meta</Badge>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Views (todas as contas)"
            value={insights.isLoading ? "…" : hasInsights ? nf.format(totalViews) : "—"}
            hint={hasInsights ? "Últimas 24h" : "Métrica indisponível para esta conta/permissão"}
            icon={Eye}
          />
          <Stat
            label="Seguidores"
            value={insights.isLoading ? "…" : hasInsights ? nf.format(totalFollowers) : "—"}
            hint={`${rows.length || accountList.length} conta(s)`}
            icon={Users}
          />
          <Stat label="Posts hoje" value={postsToday} hint={`${published} publicados no total`} icon={CheckCircle2} />
          <Stat
            label="Na fila"
            value={scheduled}
            hint={failed.length ? `${failed.length} falha(s) recente(s)` : "Nenhuma falha"}
            icon={Clock}
            tone="text-primary"
          />
        </div>
      )}

      {rows.length > 1 ? (
        <div className="panel mt-3 p-4">
          <h2 className="mb-2 text-sm font-semibold">Views por conta</h2>
          <ul className="space-y-1.5 text-xs">
            {rows.map((r) => (
              <li key={r.accountId} className="flex items-center justify-between">
                <span className="text-muted-foreground">@{r.username}</span>
                <span>{r.views !== null ? nf.format(r.views) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}


      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Próximos e recentes</h2>
            <Link to="/historico" className="text-xs text-muted-foreground hover:text-foreground">
              Ver histórico <ArrowUpRight className="inline h-3 w-3" />
            </Link>
          </div>
          {postList.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma publicação ainda. Comece pelo Composer.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {postList.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {p.caption || "Sem legenda"}
                    </p>
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

        <div className="flex flex-col gap-3">
          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Setup Meta</h2>
            <div className="space-y-1.5 text-xs">
              <Row ok={meta.data?.hasAppId} label="META_APP_ID" />
              <Row ok={meta.data?.hasAppSecret} label="META_APP_SECRET (servidor)" />
              <Row ok={Boolean(meta.data?.redirectUri)} label="META_REDIRECT_URI" />
              <Row ok={accountList.length > 0 && !isDemo} label="Conta profissional conectada" />
            </div>
            <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
              <Link to="/configuracao">Abrir configuração</Link>
            </Button>
          </div>

          <div className="panel p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Última sincronização: {fmtDate(lastSync)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-2 text-sm font-semibold">Falhas recentes</h2>
          {failed.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma falha registrada.</p>
          ) : (
            <ul className="space-y-2">
              {failed.slice(0, 4).map((p) => (
                <li key={p.id} className="rounded-md border border-destructive/25 bg-destructive/5 p-2.5">
                  <p className="text-[13px] font-medium">{p.caption || "Sem legenda"}</p>
                  <p className="text-[11px] text-destructive">{p.error_message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Últimos logs</h2>
            <Link to="/logs" className="text-xs text-muted-foreground hover:text-foreground">
              Ver todos
            </Link>
          </div>
          {logList.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sem registros por enquanto.</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px]">
              {logList.slice(0, 6).map((l) => (
                <li key={l.id} className="flex gap-2 text-muted-foreground">
                  <span className="shrink-0 text-foreground/70">[{l.area}]</span>
                  <span className="truncate">{l.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-success" : "text-warning"}>{ok ? "OK" : "Pendente"}</span>
    </div>
  );
}
