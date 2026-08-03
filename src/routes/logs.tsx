import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";

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

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Logs — Instagram Studio Solo" },
      { name: "description", content: "Registros de OAuth, publicação e sincronização, sem tokens visíveis." },
      { property: "og:title", content: "Logs — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Registros de OAuth, publicação e sincronização, sem tokens visíveis.",
      },
    ],
  }),
  component: Logs;
});

const LEVEL_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

function Logs() {
  const logs = useQuery(logsQuery);
  const [area, setArea] = useState("all");
  const [level, setLevel] = useState("all");
  const [term, setTerm] = useState("");

  const rows = (logs.data ?? []).filter(
    (l) =>
      (area === "all" || l.area === area) &&
      (level === "all" || l.level === level) &&
      (!term || l.message.toLowerCase().includes(term.toLowerCase())),
  );

  const areas = Array.from(new Set((logs.data ?? []).map((l) => l.area)));

  return (
    <AppShell title="Logs" subtitle="Auditoria interna com redação automática de segredos">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar mensagem..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-56 bg-surface"
        />
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-40 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-36 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="warn">warn</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> tokens e segredos são redigidos automaticamente
        </span>
      </div>

      {logs.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Sem logs"
          description="Ações de conexão, sincronização e publicação geram registros aqui."
        />
      ) : (
        <div className="panel divide-y divide-border font-mono text-[11px]">
          {rows.map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline gap-2 px-3.5 py-2">
              <span className="w-32 shrink-0 text-muted-foreground">{fmtDate(l.created_at)}</span>
              <span className="w-20 shrink-0 text-foreground/70">[{l.area}]</span>
              <span className={`w-16 shrink-0 uppercase ${LEVEL_TONE[l.level] ?? ""}`}>{l.level}</span>
              <span className="min-w-0 flex-1 break-words text-foreground/90">{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
