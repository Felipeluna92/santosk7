import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images, Search, Folder as FolderIcon, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { foldersQuery, mediaQuery } from "@/lib/data";

type Props = {
  /** Restrict list to a media type; omit to show all. */
  kind?: "IMAGE" | "VIDEO";
  multiple?: boolean;
  label?: string;
  onSelect: (urls: string[]) => void;
};

export function MediaPicker({ kind, multiple = false, label = "Escolher da biblioteca", onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | "all" | "none">("all");
  const [term, setTerm] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const media = useQuery({ ...mediaQuery, enabled: open });
  const folders = useQuery({ ...foldersQuery, enabled: open });

  const list = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (media.data ?? []).filter((m) => {
      if (kind && m.media_type !== kind) return false;
      if (onlyFav && !m.favorite) return false;
      if (folderId === "none" && m.folder_id) return false;
      if (folderId !== "all" && folderId !== "none" && m.folder_id !== folderId) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [media.data, kind, onlyFav, folderId, term]);

  const confirm = (urls: string[]) => {
    if (!urls.length) return;
    onSelect(urls);
    setPicked([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          <Images className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Biblioteca de mídias</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por título ou tag"
              className="h-8 bg-background pl-7 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant={onlyFav ? "default" : "secondary"}
            className="h-8"
            onClick={() => setOnlyFav((v) => !v)}
          >
            <Star className="h-3.5 w-3.5" /> Favoritos
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "all", name: "Todas" },
            { id: "none", name: "Sem pasta" },
            ...(folders.data ?? []).map((f) => ({ id: f.id, name: f.name })),
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolderId(f.id as typeof folderId)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                folderId === f.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderIcon className="h-3 w-3" /> {f.name}
            </button>
          ))}
        </div>

        <div className="max-h-[52vh] overflow-y-auto">
          {media.isLoading ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Carregando...</p>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Nenhuma mídia encontrada nesta pasta.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((m) => {
                const active = picked.includes(m.public_url);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (!multiple) {
                        confirm([m.public_url]);
                        return;
                      }
                      setPicked((prev) =>
                        prev.includes(m.public_url)
                          ? prev.filter((u) => u !== m.public_url)
                          : [...prev, m.public_url],
                      );
                    }}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${
                      active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex aspect-square items-center justify-center bg-surface-2">
                      {m.media_type === "IMAGE" ? (
                        <img src={m.public_url} alt={m.title} className="h-full w-full object-cover" />
                      ) : (
                        <Images className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="truncate px-2 py-1.5 text-[11px]">{m.title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {multiple ? (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">{picked.length} selecionada(s)</span>
            <Button type="button" size="sm" disabled={!picked.length} onClick={() => confirm(picked)}>
              Usar selecionadas
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
