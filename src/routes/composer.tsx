import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Save,
  Send,
  CalendarClock,
  Image as ImageIcon,
  Film,
  Layers,
  FileText,
  Info,
  Copy,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, postsQuery, POST_STATUS, fmtDate } from "@/lib/data";
import { publishPost } from "@/lib/meta.functions";
import { MediaUpload } from "@/components/MediaUpload";

export const Route = createFileRoute("/composer")({
  head: () => ({
    meta: [
      { title: "Publicar — Instagram Studio Solo" },
      {
        name: "description",
        content: "Crie posts, Reels e carrosséis com validação das capacidades oficiais da API.",
      },
      { property: "og:title", content: "Publicar — Instagram Studio Solo" },
      {
        property: "og:description",
        content: "Crie posts, Reels e carrosséis com validação das capacidades oficiais da API.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    midia: typeof search["midia"] === "string" ? (search["midia"] as string) : undefined,
    duplicar: typeof search["duplicar"] === "string" ? (search["duplicar"] as string) : undefined,
  }),
  component: Composer,
});

const isPublicUrl = (url: string) => {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)
    );
  } catch {
    return false;
  }
};

const fmtLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Composer() {
  const { midia, duplicar } = useSearch({ from: "/composer" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const posts = useQuery(postsQuery);

  const [type, setType] = useState<"POST" | "REEL" | "CAROUSEL">("POST");
  const [accountId, setAccountId] = useState<string>("");
  const [mediaUrl, setMediaUrl] = useState(midia ?? "");
  const [carousel, setCarousel] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");

  const accountList = accounts.data ?? [];
  const account = accountList.find((a) => a.id === accountId);
  const drafts = (posts.data ?? []).filter((p) => p.status === "draft");
  const carouselUrls = carousel.split(/\s|\n|,/).map((s) => s.trim()).filter(Boolean);

  const loadPost = (p: {
    type: string;
    account_id: string | null;
    media_url: string | null;
    cover_url: string | null;
    carousel_urls: string[] | null;
    caption: string | null;
    hashtags: string | null;
  }) => {
    setType(((p.type as "POST" | "REEL" | "CAROUSEL") ?? "POST"));
    setAccountId(p.account_id ?? "");
    setMediaUrl(p.media_url ?? "");
    setCoverUrl(p.cover_url ?? "");
    setCarousel((p.carousel_urls ?? []).join("\n"));
    setCaption(p.caption ?? "");
    setHashtags(p.hashtags ?? "");
  };

  const duplicatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!duplicar || duplicatedRef.current === duplicar) return;
    const source = (posts.data ?? []).find((p) => p.id === duplicar);
    if (!source) return;
    duplicatedRef.current = duplicar;
    loadPost(source);
    setScheduledAt("");
    setExtraTimes([]);
    toast.info("Post duplicado — escolha os novos horários.");
  }, [duplicar, posts.data]);


  const capabilityError = (() => {
    if (!accountList.length) return "Conecte uma conta Instagram profissional para publicar.";
    if (!accountId) return "Selecione a conta que vai publicar.";
    if (account && account.account_type && !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(account.account_type))
      return "A publicação pela API oficial exige conta Business ou Creator.";
    if (account && !(account.scopes ?? []).includes("instagram_business_content_publish"))
      return "A conta não tem a permissão instagram_business_content_publish aprovada.";
    return null;
  })();

  const mediaError = (() => {
    if (type === "CAROUSEL") {
      if (carouselUrls.length < 2) return "Um carrossel precisa de pelo menos 2 URLs públicas.";
      if (carouselUrls.length > 10) return "Máximo de 10 mídias por carrossel.";
      if (carouselUrls.some((u) => !isPublicUrl(u))) return "Há URLs inválidas ou não públicas no carrossel.";
      return null;
    }
    if (!mediaUrl.trim()) return "Informe a URL pública da mídia.";
    if (!isPublicUrl(mediaUrl)) return "A URL precisa ser pública e acessível pela Meta (http/https).";
    return null;
  })();

  const payload = () => ({
    account_id: accountId || null,
    type,
    caption: caption || null,
    hashtags: hashtags || null,
    media_url: type === "CAROUSEL" ? null : mediaUrl || null,
    cover_url: type === "REEL" ? coverUrl || null : null,
    carousel_urls: type === "CAROUSEL" ? carouselUrls : [],
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
  });

  const savePost = async (status: string) => {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...payload(), status })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const draftMutation = useMutation({
    mutationFn: () => savePost("draft"),
    onSuccess: () => {
      toast.success("Rascunho salvo.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!scheduledAt) throw new Error("Escolha a data e a hora do agendamento.");
      if (new Date(scheduledAt).getTime() < Date.now())
        throw new Error("A data de agendamento precisa ser no futuro.");
      if (capabilityError) throw new Error(capabilityError);
      if (mediaError) throw new Error(mediaError);
      return savePost("scheduled");
    },
    onSuccess: () => {
      toast.success("Post agendado.");
      qc.invalidateQueries({ queryKey: ["posts"] });
      navigate({ to: "/calendario" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (capabilityError) throw new Error(capabilityError);
      if (mediaError) throw new Error(mediaError);
      const id = await savePost("draft");
      return publishPost({ data: { postId: id } });
    },
    onSuccess: () => {
      toast.success("Publicado na API oficial da Meta.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = draftMutation.isPending || scheduleMutation.isPending || publishMutation.isPending;

  return (
    <AppShell title="Composer" subtitle="Criação com validação das capacidades oficiais da API">
      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
        <TabsList className="bg-surface">
          <TabsTrigger value="POST">
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> Post
          </TabsTrigger>
          <TabsTrigger value="REEL">
            <Film className="mr-1.5 h-3.5 w-3.5" /> Reel
          </TabsTrigger>
          <TabsTrigger value="CAROUSEL">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Carrossel
          </TabsTrigger>
          <TabsTrigger value="DRAFTS">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Rascunhos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="DRAFTS" className="mt-4">
          <div className="panel divide-y divide-border">
            {drafts.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                Nenhum rascunho salvo ainda.
              </p>
            ) : (
              drafts.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{d.caption || "Sem legenda"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.type} · criado em {fmtDate(d.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`border-0 ${POST_STATUS[d.status]?.tone}`}>
                      {POST_STATUS[d.status]?.label}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setType((d.type as typeof type) ?? "POST");
                        setAccountId(d.account_id ?? "");
                        setMediaUrl(d.media_url ?? "");
                        setCoverUrl(d.cover_url ?? "");
                        setCarousel((d.carousel_urls ?? []).join("\n"));
                        setCaption(d.caption ?? "");
                        setHashtags(d.hashtags ?? "");
                        toast.info("Rascunho carregado no editor.");
                      }}
                    >
                      Carregar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {(["POST", "REEL", "CAROUSEL"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
              <div className="panel space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountList.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          @{a.username} · {a.account_type}
                        </SelectItem>
                      ))}
                      {accountList.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Nenhuma conta conectada
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>

                {t === "CAROUSEL" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">URLs do carrossel (uma por linha, 2 a 10)</Label>
                    <Textarea
                      rows={5}
                      value={carousel}
                      onChange={(e) => setCarousel(e.target.value)}
                      placeholder={"https://cdn.exemplo.com/1.jpg\nhttps://cdn.exemplo.com/2.jpg"}
                      className="bg-background font-mono text-xs"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <MediaUpload
                      label={t === "REEL" ? "Vídeo do Reel" : "Imagem do post"}
                      kind={t === "REEL" ? "video" : "image"}
                      value={mediaUrl}
                      onChange={setMediaUrl}
                      hint={
                        t === "REEL"
                          ? "MP4 ou MOV, até 300 MB. Gera uma URL pública HTTPS automaticamente."
                          : "JPG ou PNG, até 8 MB. Gera uma URL pública HTTPS automaticamente."
                      }
                    />
                    {t === "REEL" ? (
                      <MediaUpload
                        label="Capa do Reel"
                        kind="image"
                        optional
                        value={coverUrl}
                        onChange={setCoverUrl}
                        hint="JPG ou PNG. Sem capa, a Meta usa a miniatura automática do vídeo (cover_url)."
                      />
                    ) : null}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ou cole uma URL pública já hospedada</Label>
                      <Input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://cdn.exemplo.com/arquivo.jpg"
                        className="bg-background font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                <p className="flex gap-1.5 rounded-md bg-secondary/60 p-2.5 text-[11px] text-muted-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  Arquivos enviados aqui ficam no armazenamento do app e recebem uma URL HTTPS pública e
                  permanente — é essa URL que a API oficial da Meta baixa como image_url, video_url ou
                  cover_url.
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Legenda</Label>
                  <Textarea
                    rows={4}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Escreva a legenda..."
                    className="bg-background"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hashtags</Label>
                    <Input
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="#marca #conteudo"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Agendar para</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                </div>

                {capabilityError || mediaError ? (
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning">
                    {capabilityError ?? mediaError}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => draftMutation.mutate()}>
                    <Save className="h-4 w-4" /> Salvar rascunho
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => scheduleMutation.mutate()}>
                    <CalendarClock className="h-4 w-4" /> Agendar
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => publishMutation.mutate()}>
                    <Send className="h-4 w-4" /> Publicar agora
                  </Button>
                </div>
              </div>

              <div className="panel p-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Preview</p>
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <div className="brand-gradient-bg h-6 w-6 rounded-full" />
                    <span className="text-xs font-medium">
                      {account ? `@${account.username}` : "sua.conta"}
                    </span>
                    <Badge className="ml-auto border-0 bg-secondary text-[10px] text-muted-foreground">
                      {t === "POST" ? "Post" : t === "REEL" ? "Reel" : "Carrossel"}
                    </Badge>
                  </div>
                  <div
                    className={`flex items-center justify-center bg-surface-2 ${t === "REEL" ? "aspect-[9/16]" : "aspect-square"}`}
                  >
                    {t === "CAROUSEL" ? (
                      carouselUrls[0] ? (
                        <img src={carouselUrls[0]} alt="Prévia do carrossel" className="h-full w-full object-cover" />
                      ) : (
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      )
                    ) : t === "REEL" ? (
                      coverUrl ? (
                        <img src={coverUrl} alt="Capa do Reel" className="h-full w-full object-cover" />
                      ) : mediaUrl ? (
                        <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline controls />
                      ) : (
                        <Film className="h-6 w-6 text-muted-foreground" />
                      )
                    ) : mediaUrl ? (
                      <img src={mediaUrl} alt="Prévia do post" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1 px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-[12px]">{caption || "Sua legenda aparece aqui."}</p>
                    <p className="text-[12px] text-[color:var(--info)]">{hashtags}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Stories:</strong> disponível apenas se o produto Meta, o
                  tipo de conta e as permissões aprovadas do seu app suportarem. Caso contrário, o recurso
                  aparece como indisponível em vez de ser contornado.
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  );
}
