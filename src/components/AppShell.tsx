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
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/contas", label: "Contas", icon: AtSign },
  { to: "/composer", label: "Composer", icon: PenSquare },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/biblioteca", label: "Biblioteca", icon: Images },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/configuracao", label: "Configuração Meta", icon: Settings2 },
] as const;

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

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 rounded-xl bg-surface/60 px-2.5 py-2.5 gradient-ring">
          <div className="brand-gradient-bg brand-glow flex h-9 w-9 items-center justify-center rounded-lg">
            <Instagram className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">Olá, santosk7</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Painel de conteúdo</p>
          </div>
        </div>


        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <p className="px-2 text-[10px] leading-relaxed text-muted-foreground">
          Somente APIs oficiais da Meta. Sem automação de navegador.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-muted-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <main className="min-w-0 flex-1 px-5 py-5">{children}</main>
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="mb-4 rounded-lg border border-dashed border-border bg-surface/60 px-3.5 py-2.5 text-xs text-muted-foreground">
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
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
