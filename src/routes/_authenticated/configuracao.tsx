import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, ShieldAlert, KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery } from "@/lib/data";
import { connectManualToken, getMetaStatus } from "@/lib/meta.functions";

export const Route = createFileRoute("/_authenticated/configuracao")({
  head: () => ({
    meta: [
      { title: "Configuração Meta — Instagram Studio Solo" },
      {
        name: "description",
        content: "Checklist de configuração do app Meta, callback URL e permissões oficiais.",
      },
      { property: "og:title", content: "Configuração Meta — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Checklist de configuração do app Meta, callback URL e permissões oficiais.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    erro: typeof search["erro"] === "string" ? (search["erro"] as string) : undefined,
  }),
  component: Configuracao,
});

const ENV_VARS = [
  { name: "META_APP_ID", desc: "ID do app criado no Meta Developers." },
  { name: "META_APP_SECRET", desc: "Segredo do app. Usado somente no servidor, nunca no frontend." },
  { name: "META_GRAPH_VERSION", desc: "Versão da Graph API. Padrão: v23.0." },
  { name: "META_REDIRECT_URI", desc: "URL de callback registrada no app Meta." },
  { name: "APP_BASE_URL", desc: "URL base pública deste app." },
];

function Configuracao() {
  const { erro } = useSearch({ from: "/_authenticated/configuracao" });
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const status = useQuery({ queryKey: ["meta-status"], queryFn: () => getMetaStatus() });
  const accounts = useQuery(accountsQuery);

  useEffect(() => {
    if (erro) toast.error(erro);
  }, [erro]);

  const connectToken = useMutation({
    mutationFn: (value: string) => connectManualToken({ data: { token: value } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível validar o token.");
        return;
      }
      setToken("");
      toast.success(`Conta @${res.username} conectada com sucesso.`);
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao conectar."),
  });

  const callbackUrl =
    status.data?.redirectUri ??
    (typeof window !== "undefined" ? `${window.location.origin}/api/public/oauth/instagram/callback` : "");

  const checklist = [
    { label: "Criar app no Meta Developers", done: Boolean(status.data?.hasAppId) },
    { label: "Adicionar o produto Instagram apropriado", done: Boolean(status.data?.hasAppId) },
    { label: "Configurar a redirect URI no app Meta", done: Boolean(status.data?.redirectUri) },
    { label: "Confirmar conta Instagram Business ou Creator", done: (accounts.data?.length ?? 0) > 0 },
    { label: "Solicitar as permissões necessárias", done: (accounts.data?.length ?? 0) > 0 },
    { label: "Conectar informando o token de acesso", done: (accounts.data?.length ?? 0) > 0 },
  ];

  return (
    <AppShell
      title="Configuração Meta"
      subtitle="Fluxo oficial Instagram API with Instagram Login"
    >
      <div className="panel mb-3 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" /> Token de acesso do Instagram
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Cole aqui o token de acesso gerado no painel da Meta (Instagram → API setup → Generate token). O
          token é enviado apenas para o backend, validado no endpoint oficial{" "}
          <code className="font-mono">graph.instagram.com/me</code> e guardado com segurança no servidor —
          nunca fica no navegador nem no localStorage.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = token.trim();
            if (value.length < 20) {
              toast.error("Cole o token de acesso completo.");
              return;
            }
            connectToken.mutate(value);
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="IGAA..."
            className="font-mono text-[12px]"
            maxLength={1000}
          />
          <Button type="submit" size="sm" disabled={connectToken.isPending}>
            {connectToken.isPending ? "Validando..." : "Salvar e conectar"}
          </Button>
        </form>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="panel min-w-0 p-4">
          <h2 className="mb-3 text-sm font-semibold">Checklist de setup</h2>
          {status.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <ul className="space-y-2">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-[13px]">
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={c.done ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" /> Variáveis e secrets
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Configure estes valores como secrets do projeto. Eles são lidos apenas pelo backend — nada
            sensível chega ao navegador nem ao localStorage.
          </p>
          <ul className="space-y-2">
            {ENV_VARS.map((v) => {
              const done =
                v.name === "META_APP_ID"
                  ? status.data?.hasAppId
                  : v.name === "META_APP_SECRET"
                    ? status.data?.hasAppSecret
                    : v.name === "META_GRAPH_VERSION"
                      ? Boolean(status.data?.graphVersion)
                      : v.name === "META_REDIRECT_URI"
                        ? Boolean(status.data?.redirectUri)
                        : Boolean(status.data?.appBaseUrl);
              return (
                <li key={v.name} className="rounded-md border border-border bg-background p-2.5">
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-[11px]">{v.name}</code>
                    <span className={`text-[10px] ${done ? "text-success" : "text-warning"}`}>
                      {done ? "configurado" : "pendente"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{v.desc}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel min-w-0 p-4">
          <h2 className="mb-2 text-sm font-semibold">Callback URL</h2>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{callbackUrl}</code>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                navigator.clipboard.writeText(callbackUrl);
                toast.success("Callback URL copiada.");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Registre exatamente esta URL como redirect URI válida no painel do app Meta e no secret{" "}
            <code className="font-mono">META_REDIRECT_URI</code>.
          </p>
        </div>

        <div className="panel min-w-0 p-4">
          <h2 className="mb-2 text-sm font-semibold">Permissões solicitadas</h2>
          <div className="flex flex-wrap gap-1.5">
            {(status.data?.scopes ?? []).map((s) => (
              <span key={s} className="rounded bg-secondary px-2 py-1 font-mono text-[11px]">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Versão da Graph API em uso:{" "}
            <code className="font-mono text-foreground">{status.data?.graphVersion ?? "v23.0"}</code>
          </p>
        </div>
      </div>

      <div className="panel mt-3 flex gap-2.5 border-warning/25 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Dependendo do produto Meta, da revisão do app e do tipo de conta, algumas integrações ainda podem
          exigir Facebook Login + Page access token. Neste caso o app mostra a limitação em vez de tentar
          contorná-la. Nenhum recurso aqui usa scraping, automação de navegador ou engenharia reversa —
          apenas endpoints oficiais da Meta.
        </p>
      </div>
    </AppShell>
  );
}
