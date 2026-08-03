import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Images, Star, Trash2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { mediaQuery } from "@/lib/data";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Instagram Studio Solo" },
      { name: "description", content: "URLs públicas de mídia salvas, com tags e favoritos." },
      { property: "og:title", content: "Biblioteca — Instagram Studio Solo" },
      { property: "og:description", content: "URLs públicas de mídia salvas, com tags e favoritos." },
    ],
  }),
  component: Biblioteca,
});

function Biblioteca() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const media = useQuery(mediaQuery);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("IMAGE");
  const [tags, setTags] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Dê um título para a mídia.");
      try {
        new URL(url);
      } catch {
        throw new Error("Informe uma URL válida.");
      }
      const { error } = await supabase.from("media_items").insert({
        title: title.trim(),
        public_url: url.trim(),
        media_type: type,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mídia salva na biblioteca.");
      setTitle("");
      setUrl("");
      setTags("");
      qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFav = useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const { error } = await supabase.from("media_items").update({ favorite }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mídia removida.");
      qc.invalidateQueries({ queryKey: ["media"] });
    },
  });

  const list = (media.data ?? []).filter((m) => (onlyFav ? m.favorite : true));

  return (
    <AppShell
      title="Biblioteca"
      subtitle="URLs públicas reutilizáveis na tela Publicar"
      actions={
        <Button size="sm" variant={onlyFav ? "default" : "secondary"} onClick={() => setOnlyFav((v) => !v)}>
          <Star className="h-4 w-4" /> Favoritos
        </Button>
      }
    >
      <div className="panel mb-3 grid gap-3 p-4 md:grid-cols-[1.2fr_2fr_0.9fr_1.2fr_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs">Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">URL pública</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://cdn.exemplo.com/arquivo.jpg"
            className="bg-background font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IMAGE">Imagem</SelectItem>
              <SelectItem value="VIDEO">Vídeo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tags (vírgula)</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} className="bg-background" />
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="h-4 w-4" /> Salvar
          </Button>
        </div>
      </div>

      {media.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Biblioteca vazia"
          description="Salve URLs públicas de imagens e vídeos para reutilizar rapidamente na tela Publicar."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((m) => (
            <div key={m.id} className="panel overflow-hidden">
              <div className="flex aspect-video items-center justify-center bg-surface-2">
                {m.media_type === "IMAGE" ? (
                  <img src={m.public_url} alt={m.title} className="h-full w-full object-cover" />
                ) : (
                  <Images className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">{m.title}</p>
                  <button
                    onClick={() => toggleFav.mutate({ id: m.id, favorite: !m.favorite })}
                    className={m.favorite ? "text-warning" : "text-muted-foreground"}
                    aria-label="Favoritar"
                  >
                    <Star className="h-3.5 w-3.5" fill={m.favorite ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(m.tags ?? []).map((t) => (
                    <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 text-[11px]"
                    onClick={() => navigate({ to: "/composer", search: { midia: m.public_url } })}
                  >
                    Usar em Publicar
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                    <a href={m.public_url} target="_blank" rel="noreferrer" aria-label="Abrir URL">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
