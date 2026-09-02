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
  Instagram,
  Menu,
  LogOut,
  BrainCircuit,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/sk7-logo.png.asset.json";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/ai", label: "IA Cálica", icon: BrainCircuit, highlight: true },
  { to: "/contas", label: "Contas", icon: AtSign },

  { to: "/composer", label: "Publicar", icon: PenSquare },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/biblioteca", label: "Biblioteca", icon: Images },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/configuracao", label: "Configuração Meta", icon: Settings2 },
] as const;

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div className="mb-7 flex items-center gap-3 px-2 py-1.5">
        <img src={logoAsset.url} alt="SK7" className="h-9 w-9 shrink-0 rounded object-cover" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-sm font-semibold">SK7 Studio</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Content operations</p>
        </div>
      </div>

      <p className="mb-2 px-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">Workspace</p>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const highlight = "highlight" in item && item.highlight;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:text-[13px]",
                highlight && "text-foreground",
                active &&
                  "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary",
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", (active || highlight) && "text-primary")} />
              {item.label}
              {highlight ? (
                <span className="ml-auto rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  IA
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/55 px-3 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
        <div className="min-w-0 leading-tight">
          <p className="text-xs font-medium">Instagram conectado</p>
          <p className="text-[10px] text-muted-foreground">Conexão oficial ativa</p>
        </div>
        <button
          type="button"
          aria-label="Sair"
          title="Sair"
          className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
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
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <SidebarInner />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-xl sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Abrir menu"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              <Menu className="h-4.5 w-4.5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[262px] flex-col border-sidebar-border bg-sidebar px-3 py-4"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarInner onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="col-start-2 min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h1>
              <span className="hidden items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
              </span>
            </div>
            {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="col-start-3 flex shrink-0 items-center gap-2">{actions}</div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-7">{children}</main>
      </div>
    </div>
  );
}


export function DemoBanner() {
  return (
    <div className="mb-4 rounded-md border border-warning/20 bg-warning/5 px-3.5 py-2.5 text-xs text-muted-foreground">
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
