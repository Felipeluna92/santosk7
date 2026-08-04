import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
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
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        toast.success("Conta criada. Confirme o e-mail para entrar.");
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6">
        <div className="space-y-1">
          <div className="brand-gradient-bg flex h-9 w-9 items-center justify-center rounded-lg">
            <Lock className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="pt-2 text-lg font-semibold">Acesso restrito</h1>
          <p className="text-xs text-muted-foreground">
            Este painel é pessoal. Entre com sua conta para gerenciar suas contas do Instagram.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">E-mail</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Senha</Label>
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {mode === "signin" ? "Entrar" : "Criar conta"}
        </Button>
        <button
          type="button"
          className="w-full text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Primeiro acesso? Criar conta" : "Já tenho conta — entrar"}
        </button>
      </form>
    </main>
  );
}
