import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/sk7-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Acesso — Studio Solo" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/" }); });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const authEmail = email.includes("@") ? email : `${email.trim()}@studio.local`;
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "Erro no acesso.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_480px]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex">
        <div className="absolute inset-0 bg-primary/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
        <div className="relative z-10 flex items-center gap-3">
          <img src={logoAsset.url} className="h-10 w-10 rounded-xl" />
          <span className="font-display text-lg font-bold tracking-tight">SK7 Studio</span>
        </div>
        <div className="relative z-10 max-w-md space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Workspace Solo</p>
          <h2 className="font-display text-5xl font-bold leading-tight tracking-tighter">Cockpit de Operações para Criadores.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">Uma suíte privada de ferramentas para automatizar, analisar e escalar sua presença no Instagram.</p>
        </div>
        <div className="relative z-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Versão 2.0 · Private Instance
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter">Bem-vindo</h1>
            <p className="text-sm text-muted-foreground">Identifique-se para acessar o workspace.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Usuário</Label>
              <Input required value={email} onChange={e => setEmail(e.target.value)} className="h-12 bg-muted/30 border-border/50 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Senha</Label>
              <Input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="h-12 bg-muted/30 border-border/50 rounded-xl" />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl font-bold text-md shadow-xl">
            {busy ? "Acessando..." : "Entrar no Workspace"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            <Lock className="h-3 w-3" /> Acesso Restrito
          </div>
        </form>
      </div>
    </main>
  );
}
