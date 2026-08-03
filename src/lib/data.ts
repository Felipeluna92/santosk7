import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Account = Tables<"instagram_accounts">;
export type Post = Tables<"posts">;
export type MediaItem = Tables<"media_items">;
export type LogRow = Tables<"logs">;
export type Settings = Tables<"settings">;

export const POST_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendado", tone: "bg-info/15 text-[color:var(--info)]" },
  publishing: { label: "Publicando", tone: "bg-warning/15 text-warning" },
  published: { label: "Publicado", tone: "bg-success/15 text-success" },
  failed: { label: "Falhou", tone: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", tone: "bg-muted text-muted-foreground" },
};

export const POST_TYPE_LABEL: Record<string, string> = {
  POST: "Post",
  REEL: "Reel",
  CAROUSEL: "Carrossel",
  STORY: "Story",
};

export const fmtDate = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const fmtDay = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

export const accountsQuery = {
  queryKey: ["accounts"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("instagram_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as Account[];
  },
};

export const postsQuery = {
  queryKey: ["posts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data as Post[];
  },
};

export const mediaQuery = {
  queryKey: ["media"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as MediaItem[];
  },
};

export const logsQuery = {
  queryKey: ["logs"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data as LogRow[];
  },
};

export const settingsQuery = {
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
    if (error) throw error;
    return data as Settings | null;
  },
};
