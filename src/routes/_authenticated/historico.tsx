import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { History, Copy, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

import { publishPost } from "@/lib/meta.functions";


import { supabase } from "@/integrations/supabase/client";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountsQuery, postsQuery, POST_STATUS, POST_TYPE_LABEL, fmtDate } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Instagram Studio Solo" },
      { name: "description", content: "Histórico de publicações com status, IDs da Meta e erros." },
      { property: "og:title", content: "Histórico — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Histórico de publicações com status, IDs da Meta e erros.",
      },
    ],
  }),
  component: Historico,
});

function Historico() {
  const qc = useQueryClient();
  const posts = useQuery(postsQuery);
  const accounts = useQuery(accountsQuery);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [term, setTerm] = useState("");

  const nameOf = (id: string | null) =>
    accounts.data?.find((a) => a.id === id)?.username ?? "—";

  const publishNow = useServerFn(publishPost);
  const forcePublish = useMutation({
    mutationFn: async (postId: string) => publishNow({ data: { postId } }),
    onSuccess: () => {
      toast.success("Publicação enviada para a API oficial.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível publicar agora."),
  });

  /** Atrasado: agendado (ou falhou) e o horário já passou. */
  const isLate = (p: { status: string; scheduled_at: string | null }) =>
    (p.status === "scheduled" || p.status === "failed") &&
    Boolean(p.scheduled_at) &&
    new Date(p.scheduled_at as string).getTime() <= Date.now();

  const deleteOne = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Post removido.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const rows = (posts.data ?? []).filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (type === "all" || p.type === type) &&
      (!term || (p.caption ?? "").toLowerCase().includes(term.toLowerCase())),
  );

  return (
    <AppShell title="Histórico" subtitle="Tudo que passou pela API oficial">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por legenda..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-56 bg-surface"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(POST_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="POST">Post</SelectItem>
            <SelectItem value="REEL">Reel</SelectItem>
            <SelectItem value="CAROUSEL">Carrossel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {posts.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhum registro"
          description="Assim que você publicar ou agendar algo, o histórico aparece aqui."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead className="text-[11px] uppercase">Conta</TableHead>

                <TableHead className="text-[11px] uppercase">Tipo</TableHead>
                <TableHead className="text-[11px] uppercase">Data</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-[11px] uppercase">ID Meta</TableHead>
                <TableHead className="text-[11px] uppercase">Erro</TableHead>
                <TableHead className="text-[11px] uppercase text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                  <TableCell className="w-8">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                      aria-label="Selecionar post"
                    />
                  </TableCell>
                  <TableCell className="text-xs">@{nameOf(p.account_id)}</TableCell>

                  <TableCell className="text-xs">{POST_TYPE_LABEL[p.type] ?? p.type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(p.published_at ?? p.scheduled_at ?? p.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`border-0 ${POST_STATUS[p.status]?.tone}`}>
                      {POST_STATUS[p.status]?.label ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {p.meta_media_id ?? p.meta_container_id ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-[11px] text-destructive">
                    {p.error_message ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {isLate(p) ? (
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={forcePublish.isPending}
                          onClick={() => forcePublish.mutate(p.id)}
                        >
                          <Send className="h-3 w-3" /> Postar agora
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="secondary" className="h-7 text-[11px]">
                        <Link to="/composer" search={{ duplicar: p.id }}>

                          <Copy className="h-3 w-3" /> Duplicar
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-destructive hover:text-destructive"
                        disabled={deleteOne.isPending}
                        onClick={() => {
                          if (confirm("Remover este post? Não dá pra desfazer.")) deleteOne.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
