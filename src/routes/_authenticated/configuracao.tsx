import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, ShieldAlert, KeyRound, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { NotificationsCard } from "@/components/NotificationsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery } from "@/lib/data";
import { connectManualToken, getMetaStatus } from "@/lib/meta.functions";

export const Route = createFileRoute("/_authenticated/configuracao")({
  head: () => ({ meta: [{ title: "Configuração — Studio Solo" }] }),
  validateSearch: (search: any) => ({ erro: search.erro }),
  component: Configuracao,
});

function Configuracao() {
  const { erro } = useSearch({ from: "/_authenticated/configuracao" });
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const status = useQuery({ queryKey: ["meta-status"], queryFn: () => getMetaStatus() });
  const accounts = useQuery(accountsQuery);

  useEffect(() => { if (erro) toast.error(erro); }, [erro]);

  const connectToken = useMutation({
    mutationFn: (v: string) => connectManualToken({ data: { token: v } }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error || "Token inválido."); return; }
      setToken(""); toast.success(`@${res.username} conectada.`); qc.invalidateQueries();
    },
  });

  const checklist = [
    { label: "App Meta Developers", done: Boolean(status.data?.hasAppId) },
    { label: "Produto Instagram Setup", done: Boolean(status.data?.hasAppId) },
    { label: "Configurar Redirect URI", done: Boolean(status.data?.redirectUri) },
    { label: "Conta Instagram Business/Creator", done: (accounts.data?.length ?? 0) > 0 },
  ];

  return (
    <AppShell title="Configuração" subtitle="Setup da API Meta">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="panel p-6 space-y-6">
            <div className="space-y-1">
              <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Token de Acesso
              </h2>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Cole o token gerado no Meta Developers. Ele é criptografado e armazenado apenas no servidor.
              </p>
            </div>
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); connectToken.mutate(token.trim()); }}>
              <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="IGAA..." className="bg-muted/20 font-mono" />
              <Button type="submit" disabled={connectToken.isPending} className="font-bold">Salvar e Validar Conexão</Button>
            </form>
          </div>

          <div className="panel p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Checklist de Ativação
            </h2>
            <div className="space-y-3">
              {checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
                  {c.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground/30" />}
                  <span className={`text-xs font-bold ${c.done ? 'text-foreground' : 'text-muted-foreground'}`}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <NotificationsCard />
          
          <div className="panel p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-muted-foreground">Callback URL</h2>
            <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-[10px]">{status.data?.redirectUri || "..."}</code>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(status.data?.redirectUri || ""); toast.success("Copiado."); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
