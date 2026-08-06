export type OverlayItem = {
  id: string;
  /** "caption" = texto livre, "mention" = marcação @usuario */
  kind: "caption" | "mention";
  text: string;
  /** posição do centro do texto, em % da largura/altura da mídia */
  xPct: number;
  yPct: number;
  /** tamanho da fonte em % da altura da mídia */
  sizePct: number;
  color: string;
  background: string;
  backgroundOn: boolean;
};

export type Overlay = OverlayItem[];

export const DEFAULT_OVERLAY: Overlay = [];

export function newOverlayItem(kind: OverlayItem["kind"], index = 0): OverlayItem {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    text: kind === "mention" ? "@usuario" : "",
    xPct: 50,
    yPct: kind === "mention" ? Math.min(92, 78 + index * 7) : Math.max(12, 30 + index * 7),
    sizePct: kind === "mention" ? 4 : 5,
    color: "#ffffff",
    background: "#000000",
    backgroundOn: true,
  };
}

export function hasOverlayContent(overlay: Overlay) {
  return overlay.some((i) => i.text.trim().length > 0);
}

function drawItem(ctx: CanvasRenderingContext2D, w: number, h: number, o: OverlayItem) {
  const lines = o.text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  const fontSize = Math.max(12, (o.sizePct / 100) * h);
  ctx.font = `600 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineH = fontSize * 1.25;
  const padX = fontSize * 0.45;
  const padY = fontSize * 0.3;
  const cx = (o.xPct / 100) * w;
  const cy = (o.yPct / 100) * h;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const blockH = lineH * lines.length;

  if (o.backgroundOn) {
    const boxW = widest + padX * 2;
    const boxH = blockH + padY * 2;
    const r = Math.min(boxH / 2, fontSize * 0.4);
    ctx.fillStyle = o.background;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, r);
    ctx.fill();
  }

  ctx.fillStyle = o.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, cy - blockH / 2 + lineH * (i + 0.5));
  });
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, overlay: Overlay) {
  overlay.forEach((item) => drawItem(ctx, w, h, item));
}

/** Grava o texto diretamente na imagem e devolve um novo arquivo JPEG. */
export async function burnImageOverlay(file: File, overlay: Overlay): Promise<File> {
  if (!hasOverlayContent(overlay)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível neste navegador.");
    ctx.drawImage(img, 0, 0);
    drawOverlay(ctx, canvas.width, canvas.height, overlay);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("Falha ao gerar a imagem com a marcação.");
    return new File([blob], file.name.replace(/\.\w+$/, "") + "-marcado.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mp4RecorderType(): string | null {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1',
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function canBurnVideoOverlay() {
  return mp4RecorderType() !== null;
}

/** Grava o texto diretamente no vídeo (re-encode MP4 no navegador). */
export async function burnVideoOverlay(
  file: File,
  overlay: Overlay,
  onProgress?: (pct: number) => void,
): Promise<File> {
  if (!hasOverlayContent(overlay)) return file;
  const mimeType = mp4RecorderType();
  if (!mimeType) {
    throw new Error(
      "Este navegador não consegue gravar o texto no vídeo em MP4. Publique o vídeo sem marcação ou use o Chrome no computador.",
    );
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = false;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível neste navegador.");

    const stream = canvas.captureStream(30);
    const source = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    const audio = source.captureStream?.().getAudioTracks() ?? [];
    audio.forEach((track) => stream.addTrack(track));

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
    });

    recorder.start(250);
    await video.play();

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, canvas.width, canvas.height, overlay);
      if (video.duration) onProgress?.(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    cancelAnimationFrame(raf);
    recorder.stop();
    const blob = await done;
    onProgress?.(100);
    return new File([blob], file.name.replace(/\.\w+$/, "") + "-marcado.mp4", { type: "video/mp4" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Validações locais antes de enviar um Story para a API oficial. */
export async function validateStoryFile(file: File, kind: "image" | "video") {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      if (!["image/jpeg", "image/png"].includes(file.type)) return "Envie uma imagem JPG ou PNG.";
      if (file.size > 8 * 1024 * 1024) return "Imagem acima de 8 MB.";
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Imagem inválida."));
        img.src = url;
      });
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio > 1.05) return "Story precisa ser vertical (proporção recomendada 9:16).";
      return null;
    }
    if (!["video/mp4", "video/quicktime"].includes(file.type)) return "Envie um vídeo MP4 ou MOV.";
    if (file.size > 100 * 1024 * 1024) return "Vídeo de Story acima de 100 MB.";
    const video = document.createElement("video");
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vídeo inválido."));
    });
    if (video.duration > 60) return "Story em vídeo aceita no máximo 60 segundos.";
    const ratio = video.videoWidth / video.videoHeight;
    if (ratio > 1.05) return "Story precisa ser vertical (proporção recomendada 9:16).";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Arquivo inválido.";
  } finally {
    URL.revokeObjectURL(url);
  }
}
