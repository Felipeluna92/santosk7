import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/sk7-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Instagram Studio Solo" },
      {
        name: "description",
        content: "Acesso restrito ao painel de publicação e agendamento do Instagram Studio Solo.",
      },
      { property: "og:title", content: "Entrar — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Acesso restrito ao painel de publicação e agendamento do Instagram Studio Solo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function toAuthEmail(input: string) {
  const value = input.trim().toLowerCase();
  if (value.includes("@")) return value;
  return `${value.replace(/[^a-z0-9._-]/g, "")}@studio.local`;
}

function AuthPage() {
  const navigate = useNavigate();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const authEmail = toAuthEmail(email);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        toast.error("Não foi possível entrar.");
        return;
      }
      await supabase.rpc("claim_app_ownership");
      navigate({ to: "/" });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_440px]">
      <section className="relative hidden overflow-hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <img src={logoAsset.url} alt="SK7" className="h-14 w-14 rounded-md object-cover" />
        <div className="max-w-xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Studio operations</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-tight text-foreground">Conteúdo, agenda e performance em um único cockpit.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Uma operação privada construída para publicar com precisão e acompanhar o que importa.</p>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">SK7 Studio · Private workspace</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 lg:px-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <img src={logoAsset.url} alt="SK7" className="mb-8 h-12 w-12 rounded-md object-cover lg:hidden" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Acesso privado</p>
          <h1 className="pt-1 text-2xl font-semibold">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">
            Este painel é pessoal. Entre com sua conta para gerenciar suas contas do Instagram.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Usuário ou e-mail</Label>
          <Input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-surface"
            autoComplete="username"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Senha</Label>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-surface"
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          Entrar <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Painel privado. Não há criação de contas — apenas o acesso do proprietário funciona.
        </p>
      </form>
      </section>
    </main>
  );
}
