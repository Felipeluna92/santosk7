import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Instagram, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import logoAsset from "@/assets/sk7-logo.png.asset.json";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQuery } from "@/lib/data";
import { completeInstagramConnection, getAuthorizationUrl } from "@/lib/meta.functions";

export const Route = createFileRoute("/_authenticated/configuracao")({
  head: () => ({
    meta: [
      { title: "Conectar Instagram — SK7 Studio" },
      { name: "description", content: "Conecte sua conta profissional do Instagram à SK7 pelo fluxo oficial e seguro da Meta." },
      { property: "og:title", content: "Conectar Instagram — SK7 Studio" },
      { property: "og:description", content: "Conexão oficial e segura para contas profissionais do Instagram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Configuracao,
});

type ConnectionState = "idle" | "opening" | "waiting" | "finishing" | "error";

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function waitForInstagramOAuth(popup: Window, expectedState: string, expectedOrigin: string | null) {
  return new Promise<string>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup || (expectedOrigin && event.origin !== expectedOrigin)) return;
      if (event.data?.state !== expectedState) return;
      if (event.data?.type === "sk7InstagramOAuthError") {
        cleanup();
        reject(new Error(event.data?.error || "A autorização foi cancelada."));
        return;
      }
      if (event.data?.type !== "sk7InstagramOAuthComplete" || typeof event.data?.code !== "string") return;
      cleanup();
      resolve(event.data.code);
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela de autorização foi fechada antes da conclusão."));
    }, 500);
  });
}

function Configuracao() {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const connected = accounts.data?.[0];
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const connect = useMutation({
    mutationFn: async () => {
      setErrorMessage("");
      setConnectionState("opening");
      const popup = window.open("", "sk7-instagram-oauth", "width=620,height=760,menubar=no,toolbar=no");
      if (!popup) throw new Error("Permita pop-ups para conectar sua conta.");
      try {
        const state = randomState();
        const result = await getAuthorizationUrl({ data: { state } });
        if (!result.url) throw new Error(result.error || "A conexão não está disponível agora.");
        const expectedOrigin = result.callbackOrigin ? new URL(result.callbackOrigin).origin : window.location.origin;
        setConnectionState("waiting");
        const completion = waitForInstagramOAuth(popup, state, expectedOrigin);
        popup.location.href = result.url;
        const code = await completion;
        setConnectionState("finishing");
        const saved = await completeInstagramConnection({ data: { code } });
        await qc.invalidateQueries({ queryKey: ["accounts"] });
        toast.success(`@${saved.username} conectada com segurança.`);
        setConnectionState("idle");
      } catch (error) {
        popup.close();
        throw error;
      }
    },
    onError: (error: Error) => {
      setConnectionState("error");
      setErrorMessage(error.message || "Não foi possível concluir a conexão.");
    },
  });

  const busy = ["opening", "waiting", "finishing"].includes(connectionState);
  const buttonLabel = connectionState === "opening"
    ? "Preparando conexão…"
    : connectionState === "waiting"
      ? "Aguardando autorização…"
      : connectionState === "finishing"
        ? "Protegendo sua conexão…"
        : connected
          ? "Reconectar"
          : "Conectar Instagram";

  return (
    <AppShell title="Conexões" subtitle="Integrações oficiais do seu workspace">
      <main className="mx-auto w-full max-w-3xl py-3 sm:py-8">
        <header className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-primary/15 bg-surface shadow-panel">
            <img src={logoAsset.url} alt="SK7" className="h-11 w-11 rounded-xl" />
          </div>
          <Badge variant="secondary" className="mb-4 gap-1.5 border border-primary/10 bg-primary/5 text-primary">
            <Sparkles className="h-3 w-3" /> Integração oficial
          </Badge>
          <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">Conecte sua conta</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Autorize a SK7 pelo fluxo oficial do Instagram e da Meta. Sua senha nunca é solicitada ou armazenada.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-panel">
          <div className="h-1 bg-gradient-to-r from-primary/50 via-primary to-info" />
          <div className="p-5 sm:p-8">
            {accounts.isLoading ? (
              <div className="space-y-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                    <Instagram className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-semibold">Instagram Professional</h2>
                      <Badge className={connected ? "border-0 bg-success/12 text-success" : "border-0 bg-muted text-muted-foreground"}>
                        {connected ? "Conectada" : "Não conectada"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Publicação, métricas e gestão em um ambiente protegido.</p>
                  </div>
                </div>

                {connected ? (
                  <div className="my-6 flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
                    <Avatar className="h-12 w-12 border border-border">
                      <AvatarImage src={connected.profile_picture_url ?? undefined} alt={`@${connected.username}`} />
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">{connected.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-semibold">@{connected.username}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-success"><Check className="h-3.5 w-3.5" /> Conexão ativa e protegida</p>
                    </div>
                  </div>
                ) : (
                  <div className="my-6 grid gap-3 sm:grid-cols-3">
                    {[{ icon: ShieldCheck, text: "Autorização oficial" }, { icon: LockKeyhole, text: "Senha nunca armazenada" }, { icon: Check, text: "Você mantém o controle" }].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-3 text-[11px] font-semibold text-muted-foreground">
                        <Icon className="h-4 w-4 shrink-0 text-primary" /> {text}
                      </div>
                    ))}
                  </div>
                )}

                {connectionState === "error" ? (
                  <div role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">{errorMessage}</div>
                ) : null}

                <Button className="h-12 w-full text-sm font-semibold shadow-glow" disabled={busy} onClick={() => connect.mutate()}>
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
                  {buttonLabel}
                </Button>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                  <LockKeyhole className="h-3.5 w-3.5" /> Comunicação criptografada. Revogue o acesso a qualquer momento.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}