import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  AtSign,
  PenSquare,
  CalendarDays,
  Images,
  History,
  ScrollText,
  Settings2,
  Menu,
  LogOut,
  BrainCircuit,
  Activity,
  BarChart3,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/sk7-logo-2026.png.asset.json";

const NAV = [
  { section: "Visão", items: [
    { to: "/", label: "Visão geral", icon: LayoutDashboard },
    { to: "/saude", label: "Saúde", icon: Activity, highlight: true },
    { to: "/metricas", label: "Métricas", icon: BarChart3 },
    { to: "/ai", label: "Inteligência", icon: BrainCircuit },
  ] },
  { section: "Conteúdo", items: [
    { to: "/calendario", label: "Calendário", icon: CalendarDays },
    { to: "/biblioteca", label: "Biblioteca", icon: Images },
    { to: "/historico", label: "Histórico", icon: History },
  ] },
  { section: "Sistema", items: [
    { to: "/contas", label: "Contas", icon: AtSign },
    { to: "/logs", label: "Logs", icon: ScrollText },
    { to: "/configuracao", label: "Configuração", icon: Settings2 },
  ] },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard },
  { to: "/saude", label: "Saúde", icon: Activity },
  { to: "/composer", label: "Publicar", icon: Plus, primary: true },
  { to: "/calendario", label: "Agenda", icon: CalendarDays },
] as const;

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div className="mb-6 flex items-center gap-3 px-2 py-1.5">
        <img src={logoAsset.url} alt="SK7" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-sm font-semibold">SK7 Command</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Instagram ops</p>
        </div>
      </div>

      <Button asChild className="mb-6 w-full justify-start shadow-none">
        <Link to="/composer"><Plus className="h-4 w-4" /> Nova publicação</Link>
      </Button>

      <nav className="flex flex-1 flex-col gap-5">
        {NAV.map((group) => <div key={group.section}>
          <p className="mb-1.5 px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground/75">{group.section}</p>
          <div className="space-y-0.5">{group.items.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const highlight = "highlight" in item && item.highlight;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:text-[13px]",
                highlight && "text-foreground",
                active &&
                  "border-primary/10 bg-sidebar-accent text-sidebar-accent-foreground shadow-xs",
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", (active || highlight) && "text-primary")} />
              {item.label}
              {highlight ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" /> : null}
            </Link>
          );
        })}</div></div>)}
      </nav>

      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/55 px-3 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
        <div className="min-w-0 leading-tight">
          <p className="text-xs font-medium">Instagram conectado</p>
          <p className="text-[10px] text-muted-foreground">Conexão oficial ativa</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Sair"
          title="Sair"
          className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <SidebarInner />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-xl sm:px-6 xl:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Abrir menu"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              <Menu className="h-4.5 w-4.5" />
            </SheetTrigger>
            <SheetContent
              side="left"
               className="flex w-[284px] flex-col border-sidebar-border bg-sidebar px-3 py-4"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarInner onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="col-start-2 min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate font-display text-base font-semibold text-foreground sm:text-lg">{title}</h1>
            </div>
            {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="col-start-3 flex shrink-0 items-center gap-2">{actions}</div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-6 md:pb-6 xl:px-8 xl:py-7">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_-24px_var(--foreground)] backdrop-blur-xl md:hidden">
        {MOBILE_NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return <Link key={item.to} to={item.to} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground", active && "text-primary", "primary" in item && item.primary && "-mt-6")}>
            {"primary" in item && item.primary ? <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><item.icon className="h-5 w-5" /></span> : <item.icon className="h-5 w-5" />}
            {item.label}
          </Link>;
        })}
        <Sheet>
          <SheetTrigger aria-label="Mais opções" className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" /> Mais
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[284px] flex-col border-sidebar-border bg-sidebar px-3 py-4">
            <SheetTitle className="sr-only">Mais opções</SheetTitle>
            <SidebarInner />
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}


export function DemoBanner() {
  return (
    <div className="mb-4 rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2.5 text-xs text-muted-foreground">
      Dados de demonstração. Conecte sua conta Instagram para usar dados reais.
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Images;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-secondary">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
