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
  CircleDot,
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
import { StoryEditor } from "@/components/StoryEditor";

export const Route = createFileRoute("/_authenticated/composer")({
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
  validateSearch: (search: Record<string, unknown>): { midia?: string; duplicar?: string } => ({
    ...(typeof search["midia"] === "string" ? { midia: search["midia"] as string } : {}),
    ...(typeof search["duplicar"] === "string" ? { duplicar: search["duplicar"] as string } : {}),
  }),

  component: Composer,
});

const TIME_SLOTS: string[] = Array.from({ length: 24 * 3 }, (_, i) => {
  const h = Math.floor(i / 3);
  const m = (i % 3) * 20;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

function Composer() {
  const { midia, duplicar } = useSearch({ from: "/_authenticated/composer" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const posts = useQuery(postsQuery);

  const [platform, setPlatform] = useState<"instagram" | "threads">("instagram");
  const [type, setType] = useState<"POST" | "REEL" | "CAROUSEL" | "STORY">("POST");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState(midia ?? "");
  const [carousel, setCarousel] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [storyKind, setStoryKind] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");

  const isThreads = platform === "threads";
  const accountList = (accounts.data ?? []).filter((a) => (a.platform ?? "instagram") === platform);
  const selectedAccounts = accountList.filter((a) => accountIds.includes(a.id));
  const account = selectedAccounts[0];
  const drafts = (posts.data ?? []).filter((p) => p.status === "draft");
  const carouselUrls = carousel.split(/\s|\n|,/).map((s) => s.trim()).filter(Boolean);
  const scheduledAt = schedDate && schedTime ? `${schedDate}T${schedTime}` : "";


  const loadPost = (p: {
    type: string;
    account_id: string | null;
    media_url: string | null;
    cover_url: string | null;
    carousel_urls: string[] | null;
    caption: string | null;
    hashtags: string | null;
  }) => {
    setType(((p.type as "POST" | "REEL" | "CAROUSEL" | "STORY") ?? "POST"));
    setAccountIds(p.account_id ? [p.account_id] : []);
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
    setSchedDate("");
    setSchedTime("");
    setExtraTimes([]);
    toast.info("Post duplicado — escolha os novos horários.");
  }, [duplicar, posts.data]);


  const capabilityError = (() => {
    if (!accountList.length)
      return isThreads
        ? "Conecte uma conta do Threads para publicar."
        : "Conecte uma conta Instagram profissional para publicar.";
    if (!accountIds.length) return "Selecione ao menos uma conta que vai publicar.";
    if (isThreads) {
      const noScope = selectedAccounts.find((a) => !(a.scopes ?? []).includes("threads_content_publish"));
      if (noScope) return `@${noScope.username} não tem a permissão threads_content_publish aprovada.`;
      return null;
    }
    const bad = selectedAccounts.find(
      (a) => a.account_type && !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(a.account_type),
    );
    if (bad) return `@${bad.username}: a publicação pela API oficial exige conta Business ou Creator.`;
    const noScope = selectedAccounts.find(
      (a) => !(a.scopes ?? []).includes("instagram_business_content_publish"),
    );
    if (noScope) return `@${noScope.username} não tem a permissão instagram_business_content_publish aprovada.`;
    return null;
  })();

  const mediaError = (() => {
    if (isThreads) {
      if (!mediaUrl.trim() && !caption.trim() && !hashtags.trim())
        return "Escreva um texto ou anexe uma mídia para publicar no Threads.";
      if (mediaUrl.trim() && !isPublicUrl(mediaUrl))
        return "A URL precisa ser pública e acessível pelo Threads (http/https).";
      return null;
    }
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

  const payload = (accId: string | null, when?: string | null) => ({
    account_id: accId,
    platform,
    type: isThreads ? "POST" : type,
    caption: !isThreads && type === "STORY" ? null : caption || null,
    hashtags: !isThreads && type === "STORY" ? null : hashtags || null,
    media_url: !isThreads && type === "CAROUSEL" ? null : mediaUrl || null,
    cover_url: !isThreads && type === "REEL" ? coverUrl || null : null,
    carousel_urls: !isThreads && type === "CAROUSEL" ? carouselUrls : [],
    scheduled_at: when ? new Date(when).toISOString() : null,
  });

  const savePost = async (status: string, accId: string | null, when?: string | null) => {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...payload(accId, when ?? null), status })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const targetAccounts = () => (accountIds.length ? accountIds : [null]);

  const draftMutation = useMutation({
    mutationFn: async () => {
      for (const acc of targetAccounts()) await savePost("draft", acc, scheduledAt || null);
      return targetAccounts().length;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `${n} rascunhos salvos.` : "Rascunho salvo.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allTimes = [scheduledAt, ...extraTimes].filter(Boolean);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!allTimes.length) throw new Error("Escolha a data e a hora do agendamento.");
      if (allTimes.some((t) => new Date(t).getTime() < Date.now()))
        throw new Error("Todos os horários precisam ser no futuro.");
      if (capabilityError) throw new Error(capabilityError);
      if (mediaError) throw new Error(mediaError);
      let n = 0;
      for (const t of allTimes)
        for (const acc of accountIds) {
          await savePost("scheduled", acc, t);
          n++;
        }
      return n;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `${n} publicações agendadas.` : "Post agendado.");
      qc.invalidateQueries({ queryKey: ["posts"] });
      navigate({ to: "/calendario" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (capabilityError) throw new Error(capabilityError);
      if (mediaError) throw new Error(mediaError);
      for (const acc of accountIds) {
        const id = await savePost("draft", acc, null);
        await publishPost({ data: { postId: id } });
      }
      return accountIds.length;
    },
    onSuccess: () => {
      toast.success("Publicado na API oficial da Meta.");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = draftMutation.isPending || scheduleMutation.isPending || publishMutation.isPending;

  return (
    <AppShell title="Publicar" subtitle="Criação, duplicação e agendamento em vários horários">

      <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/60 p-1">
        {([
          { id: "instagram" as const, label: "Instagram" },
          { id: "threads" as const, label: "Threads" },
        ]).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPlatform(p.id);
              setAccountIds([]);
              if (p.id === "threads") setType("POST");
            }}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
              platform === p.id ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
        <TabsList
          className={`grid w-full gap-1 bg-surface px-1 sm:inline-flex sm:w-auto ${isThreads ? "grid-cols-2" : "grid-cols-5"}`}
        >
          <TabsTrigger value="POST" className="px-1.5 text-[11px] sm:px-3 sm:text-sm">
            <ImageIcon className="mr-1 h-3.5 w-3.5 shrink-0" /> {isThreads ? "Thread" : "Post"}
          </TabsTrigger>
          {isThreads ? null : (
            <>
              <TabsTrigger value="REEL" className="px-1.5 text-[11px] sm:px-3 sm:text-sm">
                <Film className="mr-1 h-3.5 w-3.5 shrink-0" /> Reel
              </TabsTrigger>
              <TabsTrigger value="CAROUSEL" className="px-1.5 text-[11px] sm:px-3 sm:text-sm">
                <Layers className="mr-1 h-3.5 w-3.5 shrink-0" /> Carrossel
              </TabsTrigger>
              <TabsTrigger value="STORY" className="px-1.5 text-[11px] sm:px-3 sm:text-sm">
                <CircleDot className="mr-1 h-3.5 w-3.5 shrink-0" /> Story
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="DRAFTS" className="px-1.5 text-[11px] sm:px-3 sm:text-sm">
            <FileText className="mr-1 h-3.5 w-3.5 shrink-0" /> Rascunhos
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
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-40">

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
                        loadPost(d);
                        toast.info("Rascunho carregado no editor.");
                      }}
                    >
                      Carregar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        loadPost(d);
                        setSchedDate("");
                        setSchedTime("");
                        setExtraTimes([]);
                        setType(((d.type as typeof type) ?? "POST"));
                        toast.info("Cópia criada — escolha os novos horários.");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>

                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {(["POST", "REEL", "CAROUSEL", "STORY"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="panel min-w-0 space-y-4 p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Contas ({accountIds.length} selecionada(s))</Label>
                    {accountList.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setAccountIds(
                            accountIds.length === accountList.length ? [] : accountList.map((a) => a.id),
                          )
                        }
                      >
                        {accountIds.length === accountList.length ? "Limpar" : "Selecionar todas"}
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-1 rounded-md border border-border bg-background p-2">
                    {accountList.length === 0 ? (
                      <p className="px-1 py-2 text-[11px] text-muted-foreground">Nenhuma conta conectada</p>
                    ) : (
                      accountList.map((a) => (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[12px] hover:bg-secondary/50"
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={accountIds.includes(a.id)}
                            onChange={(e) =>
                              setAccountIds((prev) =>
                                e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                              )
                            }
                          />
                          <span className="truncate">@{a.username}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{a.account_type}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {t === "STORY" ? (
                  <StoryEditor
                    kind={storyKind}
                    onKindChange={setStoryKind}
                    value={mediaUrl}
                    onChange={setMediaUrl}
                  />
                ) : t === "CAROUSEL" ? (
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

                <div className={`space-y-1.5 ${t === "STORY" ? "hidden" : ""}`}>
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
                  <div className={`space-y-1.5 ${t === "STORY" ? "hidden" : ""}`}>
                    <Label className="text-xs">Hashtags</Label>
                    <Input
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="#marca #conteudo"
                      className="bg-background"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data</Label>
                      <Input
                        type="date"
                        value={schedDate}
                        onChange={(e) => setSchedDate(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Horário</Label>
                      <Select value={schedTime} onValueChange={setSchedTime}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {TIME_SLOTS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Repetir este conteúdo em outros horários</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {allTimes.length} agendamento(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Mesma legenda, hashtags, mídia e capa — uma cópia agendada para cada horário.
                  </p>
                  <div className="flex gap-2">
                    <Select value={newTime} onValueChange={setNewTime}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Horário (mesma data)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {TIME_SLOTS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!newTime) return;
                        if (!schedDate) {
                          toast.error("Escolha a data primeiro.");
                          return;
                        }
                        const value = `${schedDate}T${newTime}`;
                        if (allTimes.includes(value)) {
                          toast.error("Esse horário já está na lista.");
                          return;
                        }
                        setExtraTimes((prev) => [...prev, value]);
                        setNewTime("");
                      }}
                    >
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  </div>
                  {extraTimes.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {extraTimes.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px]"
                        >
                          {fmtDate(new Date(t).toISOString())}
                          <button
                            type="button"
                            aria-label="Remover horário"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setExtraTimes((prev) => prev.filter((x) => x !== t))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
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
                    <CalendarClock className="h-4 w-4" /> Agendar{allTimes.length > 1 ? ` (${allTimes.length})` : ""}
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
                      {t === "POST" ? "Post" : t === "REEL" ? "Reel" : t === "STORY" ? "Story" : "Carrossel"}
                    </Badge>
                  </div>
                  <div
                    className={`flex items-center justify-center bg-surface-2 ${t === "REEL" || t === "STORY" ? "aspect-[9/16]" : "aspect-square"}`}
                  >
                    {t === "CAROUSEL" ? (
                      carouselUrls[0] ? (
                        <img src={carouselUrls[0]} alt="Prévia do carrossel" className="h-full w-full object-cover" />
                      ) : (
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      )
                    ) : t === "STORY" ? (
                      mediaUrl ? (
                        storyKind === "video" ? (
                          <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline controls />
                        ) : (
                          <img src={mediaUrl} alt="Prévia do Story" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <CircleDot className="h-6 w-6 text-muted-foreground" />
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
                  <strong className="text-foreground">Stories:</strong> publicados pela API oficial com
                  media_type=STORIES. Legenda, hashtags e menção clicável não existem em Stories pela API —
                  a marcação de @usuário é apenas visual, gravada no arquivo antes do upload.
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  );
}
