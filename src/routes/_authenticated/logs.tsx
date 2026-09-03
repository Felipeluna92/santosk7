import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, ShieldCheck, Search, Filter } from "lucide-react";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logsQuery, fmtDate } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [{ title: "Auditoria — Studio Solo" }],
  }),
  component: Logs,
});

const LEVEL_TONE: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warn: "bg-warning/15 text-warning",
  error: "bg-destructive/15 text-destructive",
};

function Logs() {
  const logs = useQuery(logsQuery);
  const [area, setArea] = useState("all");
  const [term, setTerm] = useState("");

  const rows = (logs.data ?? []).filter(
    (l) => (area === "all" || l.area === area) && (!term || l.message.toLowerCase().includes(term.toLowerCase()))
  );

  const areas = Array.from(new Set((logs.data ?? []).map((l) => l.area)));

  return (
    <AppShell title="Auditoria" subtitle="Logs do sistema">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filtrar eventos..." value={term} onChange={(e) => setTerm(e.target.value)} className="pl-9 bg-muted/20" />
        </div>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-48 bg-muted/20">
            <SelectValue placeholder="Todas áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Áreas</SelectItem>
            {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          <ShieldCheck className="h-4 w-4 text-success/50" /> 
          Redação de Segredos Ativa
        </div>
      </div>

      <div className="panel overflow-hidden">
        {logs.isLoading ? <Skeleton className="h-96 rounded-2xl" /> : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nenhum Evento" description="Os logs de operação aparecerão aqui." />
        ) : (
          <div className="divide-y divide-border font-mono text-[11px]">
            {rows.map((l) => (
              <div key={l.id} className="group flex flex-col gap-2 p-4 transition-colors hover:bg-muted/10 md:flex-row md:items-center md:gap-6">
                <span className="w-32 shrink-0 font-bold text-muted-foreground/60">{fmtDate(l.created_at)}</span>
                <span className="w-20 shrink-0 font-bold text-primary/60">[{l.area}]</span>
                <span className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[9px] font-bold uppercase ${LEVEL_TONE[l.level] || ""}`}>{l.level}</span>
                <span className="min-w-0 flex-1 break-words text-foreground/80 group-hover:text-foreground">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
