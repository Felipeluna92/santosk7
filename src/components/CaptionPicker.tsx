import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, FileText, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { captionsQuery } from "@/lib/data";

type Props = {
  current: string;
  onUse: (text: string) => void;
  onUseMany?: (texts: string[]) => void;
};

export function CaptionPicker({ current, onUse, onUseMany }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const captions = useQuery({ ...captionsQuery, enabled: open });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["caption-templates"] });

  const save = useMutation({
    mutationFn: async () => {
      if (!current.trim()) throw new Error("Escreva uma legenda antes de salvar.");
      const { error } = await supabase.from("caption_templates").insert({
        title: title.trim() || current.trim().slice(0, 40),
        body: current.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Legenda salva.");
      setTitle("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("caption_templates").update({ title: name }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caption_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]">
          <FileText className="h-3.5 w-3.5" /> Legendas salvas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Legendas salvas</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome para salvar a legenda atual"
            className="h-8 bg-background text-xs"
          />
          <Button type="button" size="sm" className="h-8" onClick={() => save.mutate()} disabled={save.isPending}>
            <BookmarkPlus className="h-3.5 w-3.5" /> Salvar atual
          </Button>
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto">
          {(captions.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma legenda salva ainda.
            </p>
          ) : (
            (captions.data ?? []).map((c) => {
              const active = picked.includes(c.body);
              return (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 ${active ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.title}</p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Renomear"
                      onClick={() => {
                        const name = window.prompt("Novo nome da legenda", c.title);
                        if (name?.trim()) rename.mutate({ id: c.id, name: name.trim() });
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label="Excluir"
                      onClick={() => remove.mutate(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {c.body}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        onUse(c.body);
                        setOpen(false);
                      }}
                    >
                      Usar agora
                    </Button>
                    {onUseMany ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-7 text-[11px]"
                        onClick={() =>
                          setPicked((prev) =>
                            prev.includes(c.body) ? prev.filter((b) => b !== c.body) : [...prev, c.body],
                          )
                        }
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : null} Variação
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {onUseMany ? (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">
              {picked.length} legenda(s) marcada(s) como variação
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!picked.length}
              onClick={() => {
                onUseMany(picked);
                setPicked([]);
                setOpen(false);
              }}
            >
              Usar como variações
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
