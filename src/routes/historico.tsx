import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/historico")({
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
  const posts = useQuery(postsQuery);
  const accounts = useQuery(accountsQuery);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [term, setTerm] = useState("");

  const nameOf = (id: string | null) =>
    accounts.data?.find((a) => a.id === id)?.username ?? "—";

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
                <TableRow key={p.id}>
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
                    <Button asChild size="sm" variant="secondary" className="h-7 text-[11px]">
                      <Link to="/composer" search={{ duplicar: p.id }}>
                        <Copy className="h-3 w-3" /> Duplicar
                      </Link>
                    </Button>
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
