import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2, Info, Type, Plus, AtSign, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadLocalFile, removeUploadedFile, pathFromPublicUrl } from "@/lib/uploads";
import {
  DEFAULT_OVERLAY,
  burnImageOverlay,
  burnVideoOverlay,
  canBurnVideoOverlay,
  newOverlayItem,
  validateStoryFile,
  type Overlay,
  type OverlayItem,
} from "@/lib/overlay";

type Props = {
  kind: "image" | "video";
  onKindChange: (kind: "image" | "video") => void;
  value: string;
  onChange: (url: string) => void;
};

export function StoryEditor({ kind, onKindChange, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(DEFAULT_OVERLAY);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const accept = kind === "image" ? "image/jpeg,image/png" : "video/mp4,video/quicktime";
  const active = overlay.find((i) => i.id === activeId) ?? null;

  const patchActive = (patch: Partial<OverlayItem>) =>
    setOverlay((list) => list.map((i) => (i.id === activeId ? { ...i, ...patch } : i)));

  const addItem = (itemKind: OverlayItem["kind"]) => {
    const item = newOverlayItem(itemKind, overlay.filter((i) => i.kind === itemKind).length);
    setOverlay((list) => [...list, item]);
    setActiveId(item.id);
  };

  const removeItem = (id: string) => {
    setOverlay((list) => list.filter((i) => i.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  };

  const pickFile = async (picked: File) => {
    const invalid = await validateStoryFile(picked, kind);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (localUrl) URL.revokeObjectURL(localUrl);
    setFile(picked);
    setLocalUrl(URL.createObjectURL(picked));
    onChange("");
  };

  const move = useCallback((id: string, clientX: number, clientY: number) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * 100;
    const y = ((clientY - box.top) / box.height) * 100;
    setOverlay((list) =>
      list.map((i) =>
        i.id === id
          ? { ...i, xPct: Math.min(98, Math.max(2, x)), yPct: Math.min(98, Math.max(2, y)) }
          : i,
      ),
    );
  }, []);

  const send = async () => {
    if (!file) {
      toast.error("Escolha a imagem ou o vídeo do Story.");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const prepared =
        kind === "image"
          ? await burnImageOverlay(file, overlay)
          : await burnVideoOverlay(file, overlay, setProgress);
      const { url } = await uploadLocalFile(prepared, kind);
      onChange(url);
      toast.success("Story preparado e publicado no armazenamento com URL pública.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao preparar o Story.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const clear = async () => {
    const path = pathFromPublicUrl(value);
    onChange("");
    setFile(null);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl("");
    if (path) await removeUploadedFile(path).catch(() => undefined);
  };

  const videoOverlayBlocked = kind === "video" && !canBurnVideoOverlay();

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-md border border-border bg-background p-1">
        {(["image", "video"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKindChange(k)}
            className={`flex-1 rounded px-2 py-1.5 text-[11px] transition-colors ${
              kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "image" ? "Imagem" : "Vídeo"}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void pickFile(picked);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
        <div
          ref={stageRef}
          className="relative mx-auto aspect-[9/16] w-full max-w-[180px] select-none overflow-hidden rounded-lg border border-border bg-surface-2"
        >
          {localUrl ? (
            kind === "image" ? (
              <img src={localUrl} alt="Prévia do Story" className="h-full w-full object-cover" />
            ) : (
              <video src={localUrl} className="h-full w-full object-cover" muted playsInline controls />
            )
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-[11px] text-muted-foreground"
            >
              <Upload className="h-4 w-4" />
              Escolher {kind === "image" ? "imagem" : "vídeo"} 9:16
            </button>
          )}

          {overlay
            .filter((item) => item.text.trim())
            .map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setActiveId(item.id);
                  move(item.id, e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) move(item.id, e.clientX, e.clientY);
                }}
                style={{
                  left: `${item.xPct}%`,
                  top: `${item.yPct}%`,
                  transform: "translate(-50%, -50%)",
                  color: item.color,
                  background: item.backgroundOn ? item.background : "transparent",
                }}
                className={`absolute cursor-move rounded-xl px-2 py-0.5 text-center font-semibold leading-tight ${
                  activeId === item.id ? "outline outline-1 outline-primary" : ""
                }`}
              >
                <span
                  style={{ fontSize: `${(item.sizePct / 100) * 320}px` }}
                  className="block whitespace-pre-wrap"
                >
                  {item.text}
                </span>
              </div>
            ))}
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => addItem("caption")}>
              <Plus className="h-4 w-4" /> Legenda
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => addItem("mention")}>
              <AtSign className="h-4 w-4" /> Marcação
            </Button>
          </div>

          {overlay.length ? (
            <div className="flex flex-wrap gap-1.5">
              {overlay.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                    activeId === item.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <button type="button" onClick={() => setActiveId(item.id)} className="max-w-[120px] truncate">
                    {item.text.trim() || (item.kind === "mention" ? "@..." : "Legenda")}
                  </button>
                  <button type="button" onClick={() => removeItem(item.id)} aria-label="Remover camada">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Adicione uma legenda e quantas marcações quiser; arraste cada uma na prévia.
            </p>
          )}

          {active ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {active.kind === "mention" ? "Marcação visual (@usuário)" : "Texto da legenda"}
                </Label>
                {active.kind === "mention" ? (
                  <Input
                    value={active.text}
                    onChange={(e) => patchActive({ text: e.target.value.slice(0, 60) })}
                    placeholder="@usuario"
                    className="bg-background"
                  />
                ) : (
                  <Textarea
                    value={active.text}
                    onChange={(e) => patchActive({ text: e.target.value.slice(0, 200) })}
                    placeholder="Escreva a legenda do Story"
                    rows={3}
                    className="bg-background"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Tamanho</Label>
                  <input
                    type="range"
                    min={2}
                    max={10}
                    step={0.25}
                    value={active.sizePct}
                    onChange={(e) => patchActive({ sizePct: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Texto</Label>
                    <input
                      type="color"
                      value={active.color}
                      onChange={(e) => patchActive({ color: e.target.value })}
                      className="h-8 w-10 rounded border border-border bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Fundo</Label>
                    <input
                      type="color"
                      value={active.background}
                      onChange={(e) => patchActive({ background: e.target.value })}
                      className="h-8 w-10 rounded border border-border bg-background"
                    />
                  </div>
                  <label className="flex items-center gap-1 pb-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={active.backgroundOn}
                      onChange={(e) => patchActive({ backgroundOn: e.target.checked })}
                    />
                    usar
                  </label>
                </div>
              </div>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {file ? "Trocar arquivo" : "Escolher arquivo"}
            </Button>
            <Button size="sm" disabled={busy || !file} onClick={() => void send()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
              {busy
                ? progress !== null
                  ? `Gravando texto... ${progress}%`
                  : "Preparando..."
                : "Aplicar textos e enviar"}
            </Button>
            {value ? (
              <Button size="icon" variant="ghost" onClick={() => void clear()} aria-label="Remover mídia">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {value ? (
            <p className="truncate rounded-md border border-border bg-background p-2 font-mono text-[10px] text-muted-foreground">
              {value}
            </p>
          ) : null}

          {videoOverlayBlocked ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
              Este navegador não grava texto em vídeo MP4. Envie o vídeo sem marcação ou use o Chrome no
              computador.
            </p>
          ) : null}

          <p className="flex gap-1.5 rounded-md bg-secondary/60 p-2.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            Marcação visual; a API não cria menção clicável nem envia notificação. Os textos são gravados no
            arquivo antes do upload e nenhum <code>user_tags</code> é enviado à Meta.
          </p>
        </div>
      </div>
    </div>
  );
}
