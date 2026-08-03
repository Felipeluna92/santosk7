import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AtSign, RefreshCw, KeyRound, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell, DemoBanner, EmptyState } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { accountsQuery, fmtDate } from "@/lib/data";
import { demoAccounts } from "@/lib/demo";
import { disconnectAccount, syncAccount } from "@/lib/meta.functions";

export const Route = createFileRoute("/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Instagram Studio Solo" },
      {
        name: "description",
        content: "Contas profissionais do Instagram conectadas por OAuth oficial da Meta.",
      },
      { property: "og:title", content: "Contas — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Contas profissionais do Instagram conectadas por OAuth oficial da Meta.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    conectado: typeof search["conectado"] === "string" ? (search["conectado"] as string) : undefined,
  }),
  component: ContasPage,
});

function ContasPage() {
  const search = useSearch({ from: "/contas" });
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);

  useEffect(() => {
    if (search.conectado) toast.success(`Conta @${search.conectado} conectada.`);
  }, [search.conectado]);

  const sync = useMutation({
    mutationFn: (accountId: string) => syncAccount({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Conta sincronizada.");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (accountId: string) => disconnectAccount({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Conta removida.");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDemo = !accounts.isLoading && (accounts.data?.length ?? 0) === 0;
  const list = isDemo ? demoAccounts : (accounts.data ?? []);

  return (
    <AppShell
      title="Contas"
      subtitle="Contas Instagram Business ou Creator conectadas por token de acesso oficial"
      actions={
        <Button size="sm" asChild>
          <Link to="/configuracao">
            <KeyRound className="h-4 w-4" /> Conectar por token
          </Link>
        </Button>
      }
    >
      {isDemo ? <DemoBanner /> : null}

      {accounts.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={AtSign}
          title="Nenhuma conta conectada"
          description="Cole o token de acesso oficial da Meta na tela de Configuração para conectar sua conta Instagram Business ou Creator."
          action={<Button onClick={() => connect.mutate()}>Conectar Instagram</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((acc) => (
            <div key={acc.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border border-border">
                  <AvatarImage src={acc.profile_picture_url ?? undefined} alt={acc.username} />
                  <AvatarFallback className="bg-secondary text-xs">
                    {acc.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold">@{acc.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {acc.display_name || "Sem nome"} · ID {acc.instagram_user_id}
                  </p>
                </div>
                <Badge
                  className={`ml-auto border-0 ${
                    acc.status === "connected" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  }`}
                >
                  {acc.status === "connected" ? "Conectada" : acc.status}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="text-right">{acc.account_type ?? "—"}</dd>
                <dt className="text-muted-foreground">Token expira</dt>
                <dd className="text-right">{fmtDate(acc.token_expires_at)}</dd>
                <dt className="text-muted-foreground">Última sync</dt>
                <dd className="text-right">{fmtDate(acc.last_sync_at)}</dd>
              </dl>

              <div className="flex flex-wrap gap-1">
                {(acc.scopes ?? []).map((s) => (
                  <span
                    key={s}
                    className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>

              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Token guardado apenas no servidor.
              </p>

              <div className="mt-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  disabled={isDemo || sync.isPending}
                  onClick={() => sync.mutate(acc.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Sincronizar
                </Button>
                <Button size="sm" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate()}>
                  Reconectar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={isDemo || remove.isPending}
                  onClick={() => remove.mutate(acc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
