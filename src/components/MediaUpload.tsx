import { useRef, useState } from "react";
import { Upload, X, Loader2, Film } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadLocalFile, removeUploadedFile, pathFromPublicUrl, validateFile } from "@/lib/uploads";

type Props = {
  label: string;
  kind: "image" | "video";
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  optional?: boolean;
};

export function MediaUpload({ label, kind, value, onChange, hint, optional }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const accept = kind === "image" ? "image/jpeg,image/png" : "video/mp4,video/quicktime";

  const handleFile = async (file: File) => {
    const invalid = validateFile(file, kind);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setBusy(true);
    try {
      const { url } = await uploadLocalFile(file, kind);
      onChange(url);
      toast.success("Arquivo enviado e URL pública gerada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = async () => {
    const path = pathFromPublicUrl(value);
    onChange("");
    if (path) await removeUploadedFile(path).catch(() => undefined);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {optional ? <span className="ml-1 text-muted-foreground">(opcional)</span> : null}
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-surface-2">
            {kind === "image" ? (
              <img src={value} alt={label} className="h-full w-full object-cover" />
            ) : (
              <video src={value} className="h-full w-full object-cover" muted playsInline />
            )}
          </div>
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{value}</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            Substituir
          </Button>
          <Button size="icon" variant="ghost" disabled={busy} onClick={() => void clear()} aria-label="Remover arquivo">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : kind === "video" ? <Film className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {busy ? "Enviando arquivo..." : `Escolher ${kind === "image" ? "imagem" : "vídeo"} do dispositivo`}
        </button>
      )}

      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
