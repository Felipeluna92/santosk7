import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight, PlayCircle, Ban, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { postsQuery, POST_STATUS, POST_TYPE_LABEL, fmtDate } from "@/lib/data";
import { publishPending, publishPost } from "@/lib/meta.functions";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — Instagram Studio Solo" },
      { name: "description", content: "Visão mensal simples dos posts agendados e publicados." },
      { property: "og:title", content: "Calendário — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Visão mensal simples dos posts agendados e publicados.",
      },
    ],
  }),
  component: Calendario,
});

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function Calendario() {
  const qc = useQueryClient();
  const posts = useQuery(postsQuery);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const list = posts.data ?? [];
  const pending = list
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const forDay = (day: number) =>
    list.filter((p) => {
      const ref = p.scheduled_at ?? p.published_at;
      if (!ref) return false;
      const d = new Date(ref);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });

  const runPending = useMutation({
    mutationFn: () => publishPending(),
    onSuccess: (r) => {
      toast.success(`Pendentes processados: ${r.ok} publicados, ${r.failed} falhas.`);
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishOne = useMutation({
    mutationFn: (postId: string) => publishPost({ data: { postId } }),
    onSuccess: () => {
      toast.success("Publicado.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelOne = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("posts").update({ status: "cancelled" }).eq("id", postId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Calendário"
      subtitle="Agendamento simples, sem filas complexas"
      actions={
        <Button size="sm" onClick={() => runPending.mutate()} disabled={runPending.isPending}>
          <PlayCircle className="h-4 w-4" /> Publicar pendentes agora
        </Button>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
        Para publicação automática no horário exato, configure uma função agendada/cron no backend ou serviço
        externo. Sem cron, use o botão Publicar pendentes agora.
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold capitalize">
              {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {posts.isLoading ? (
            <Skeleton className="h-80 rounded-lg" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] uppercase text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => (
                  <div
                    key={i}
                    className={`min-h-[74px] rounded-md border p-1.5 ${
                      day ? "border-border bg-background" : "border-transparent"
                    }`}
                  >
                    {day ? (
                      <>
                        <span className="text-[10px] text-muted-foreground">{day}</span>
                        <div className="mt-1 space-y-1">
                          {forDay(day).slice(0, 2).map((p) => (
                            <div
                              key={p.id}
                              className={`truncate rounded px-1 py-0.5 text-[10px] ${POST_STATUS[p.status]?.tone}`}
                              title={p.caption ?? ""}
                            >
                              {POST_TYPE_LABEL[p.type] ?? p.type}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">Pendentes ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Nada agendado no momento.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.id} className="rounded-md border border-border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{p.caption || "Sem legenda"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {POST_TYPE_LABEL[p.type]} · {fmtDate(p.scheduled_at)}
                      </p>
                    </div>
                    <Badge className={`shrink-0 border-0 ${POST_STATUS[p.status]?.tone}`}>
                      {POST_STATUS[p.status]?.label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      disabled={publishOne.isPending}
                      onClick={() => publishOne.mutate(p.id)}
                    >
                      Publicar
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                      <Link to="/composer" search={{ duplicar: p.id }}>
                        <Copy className="h-3 w-3" /> Duplicar
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] text-muted-foreground"
                      disabled={cancelOne.isPending}
                      onClick={() => cancelOne.mutate(p.id)}
                    >
                      <Ban className="h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
