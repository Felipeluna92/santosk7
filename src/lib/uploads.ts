import { supabase } from "@/integrations/supabase/client";
import { getUploadBaseUrl } from "./uploads.functions";

export const IMAGE_TYPES = ["image/jpeg", "image/png"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB (limite da API oficial)
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB

let cachedBase: string | null | undefined;

async function baseUrl() {
  if (cachedBase === undefined) {
    const res = await getUploadBaseUrl();
    cachedBase = res.baseUrl;
  }
  return cachedBase ?? window.location.origin;
}

export function validateFile(file: File, kind: "image" | "video") {
  const types = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!types.includes(file.type)) {
    return kind === "image"
      ? "Formato inválido. Envie uma imagem JPG ou PNG."
      : "Formato inválido. Envie um vídeo MP4 ou MOV.";
  }
  if (file.size > max) {
    return `Arquivo muito grande. Limite de ${Math.round(max / (1024 * 1024))} MB.`;
  }
  return null;
}

function safeName(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return `${crypto.randomUUID()}${ext}`;
}

/** Uploads a local file to Lovable storage and returns a stable public HTTPS URL. */
export async function uploadLocalFile(file: File, kind: "image" | "video") {
  const error = validateFile(file, kind);
  if (error) throw new Error(error);

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Entre novamente para enviar arquivos.");
  const path = `${authData.user.id}/${new Date().toISOString().slice(0, 10)}/${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);

  const base = await baseUrl();
  return { url: `${base}/api/public/media/${path}`, path };
}

export async function removeUploadedFile(path: string) {
  await supabase.storage.from("media").remove([path]);
}

export function pathFromPublicUrl(url: string) {
  const match = url.match(/\/api\/public\/media\/(.+)$/);
  return match?.[1] ?? null;
}
