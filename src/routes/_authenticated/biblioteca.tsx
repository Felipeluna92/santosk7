import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Images,
  Star,
  Trash2,
  Plus,
  ExternalLink,
  Upload,
  Loader2,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
} from "lucide-react";
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
import { foldersQuery, mediaQuery } from "@/lib/data";
import { uploadLocalFile, validateFile } from "@/lib/uploads";

export const Route = createFileRoute("/_authenticated/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Instagram Studio Solo" },
      { name: "description", content: "Pastas, mídias salvas com tags e favoritos para reutilizar ao publicar." },
      { property: "og:title", content: "Biblioteca — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Pastas, mídias salvas com tags e favoritos para reutilizar ao publicar.",
      },
    ],
  }),
  component: Biblioteca,
});

const NO_FOLDER = "__none__";

function Biblioteca() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const media = useQuery(mediaQuery);
  const folders = useQuery(foldersQuery);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("IMAGE");
  const [tags, setTags] = useState("");
  const [folderId, setFolderId] = useState<string>(NO_FOLDER);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidateMedia = () => qc.invalidateQueries({ queryKey: ["media"] });
  const invalidateFolders = () => qc.invalidateQueries({ queryKey: ["media-folders"] });

  const handleFile = async (file: File) => {
    const kind = file.type.startsWith("video") ? "video" : "image";
    const invalid = validateFile(file, kind);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const { url: publicUrl } = await uploadLocalFile(file, kind);
      setUrl(publicUrl);
      setType(kind === "video" ? "VIDEO" : "IMAGE");
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success("Arquivo enviado. Complete os dados e salve.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("media_folders").insert({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Pasta criada.");
      invalidateFolders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("media_folders").update({ name }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidateFolders,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_folders").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Pasta removida. As mídias continuam salvas.");
      setActiveFolder("all");
      invalidateFolders();
      invalidateMedia();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        folder_id: folderId === NO_FOLDER ? null : folderId,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mídia salva na biblioteca.");
      setTitle("");
      setUrl("");
      setTags("");
      invalidateMedia();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("media_items").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidateMedia,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mídia removida.");
      invalidateMedia();
    },
  });

  const list = (media.data ?? []).filter((m) => {
    if (onlyFav && !m.favorite) return false;
    if (activeFolder === "all") return true;
    if (activeFolder === NO_FOLDER) return !m.folder_id;
    return m.folder_id === activeFolder;
  });

  const folderTabs = [
    { id: "all", name: "Todas" },
    { id: NO_FOLDER, name: "Sem pasta" },
    ...(folders.data ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];

  return (
    <AppShell
      title="Biblioteca"
      subtitle="Pastas e mídias reutilizáveis na tela Publicar"
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const name = window.prompt("Nome da nova pasta");
              if (name?.trim()) createFolder.mutate(name.trim());
            }}
          >
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </Button>
          <Button size="sm" variant={onlyFav ? "default" : "secondary"} onClick={() => setOnlyFav((v) => !v)}>
            <Star className="h-4 w-4" /> Favoritos
          </Button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {folderTabs.map((f) => {
          const isCustom = f.id !== "all" && f.id !== NO_FOLDER;
          return (
            <span
              key={f.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                activeFolder === f.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <button type="button" className="inline-flex items-center gap-1" onClick={() => setActiveFolder(f.id)}>
                <FolderIcon className="h-3 w-3" /> {f.name}
              </button>
              {isCustom ? (
                <>
                  <button
                    type="button"
                    aria-label="Renomear pasta"
                    className="hover:text-foreground"
                    onClick={() => {
                      const name = window.prompt("Novo nome da pasta", f.name);
                      if (name?.trim()) renameFolder.mutate({ id: f.id, name: name.trim() });
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir pasta"
                    className="hover:text-destructive"
                    onClick={() => deleteFolder.mutate(f.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              ) : null}
            </span>
          );
        })}
      </div>

      <div className="panel mb-3 space-y-3 p-4">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando arquivo..." : "Subir imagem ou vídeo do dispositivo (JPG, PNG, MP4 ou MOV)"}
        </button>
        <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_0.9fr_1fr_1.2fr_auto]">
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
            <Label className="text-xs">Pasta</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLDER}>Sem pasta</SelectItem>
                {(folders.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
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
          description="Suba arquivos ou salve URLs públicas para reutilizar rapidamente na tela Publicar."
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
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        const name = window.prompt("Novo nome da mídia", m.title);
                        if (name?.trim()) updateItem.mutate({ id: m.id, values: { title: name.trim() } });
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Renomear mídia"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => updateItem.mutate({ id: m.id, values: { favorite: !m.favorite } })}
                      className={m.favorite ? "text-warning" : "text-muted-foreground"}
                      aria-label="Favoritar"
                    >
                      <Star className="h-3.5 w-3.5" fill={m.favorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
                <Select
                  value={m.folder_id ?? NO_FOLDER}
                  onValueChange={(v) =>
                    updateItem.mutate({ id: m.id, values: { folder_id: v === NO_FOLDER ? null : v } })
                  }
                >
                  <SelectTrigger className="h-7 bg-background text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER}>Sem pasta</SelectItem>
                    {(folders.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
