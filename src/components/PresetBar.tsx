import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Plus, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { presetsQuery, type PostPreset } from "@/lib/data";

export type PresetPayload = {
  platform: string;
  type: string;
  account_ids: string[];
  caption: string | null;
  caption_variants: string[];
  hashtags: string | null;
  media_url: string | null;
  cover_url: string | null;
  carousel_urls: string[];
  default_time: string | null;
};

type Props = {
  platform: string;
  current: () => PresetPayload;
  onApply: (preset: PostPreset) => void;
};

export function PresetBar({ platform, current, onApply }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const presets = useQuery(presetsQuery);

  const list = (presets.data ?? []).filter((p) => p.platform === platform);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["post-presets"] });

  const save = useMutation({
    mutationFn: async () => {
      const title = name.trim();
      if (!title) throw new Error("Dê um nome à predefinição.");
      const { error } = await supabase.from("post_presets").insert({ name: title, ...current() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Predefinição salva.");
      setName("");
      setAdding(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("post_presets").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return (
    <div className="panel mb-3 flex flex-wrap items-center gap-2 p-2.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3.5 w-3.5" /> Predefinições
      </span>

      {list.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">
          Nenhuma ainda — monte um post e salve para reusar em 1 clique.
        </span>
      ) : (
        list.map((p) => (
          <span
            key={p.id}
            className="group inline-flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-2.5 pr-1 text-[11px]"
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium hover:text-primary"
              onClick={() => {
                onApply(p);
                toast.success(`"${p.name}" aplicada.`);
              }}
            >
              <Bookmark className="h-3 w-3" /> {p.name}
            </button>
            <button
              type="button"
              aria-label="Excluir predefinição"
              className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
              onClick={() => remove.mutate(p.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {adding ? (
          <>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save.mutate()}
              placeholder="Nome da predefinição"
              className="h-7 w-44 bg-background text-xs"
            />
            <Button size="sm" className="h-7 text-[11px]" disabled={save.isPending} onClick={() => save.mutate()}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setAdding(false);
                setName("");
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Salvar atual
          </Button>
        )}
      </div>
    </div>
  );
}
