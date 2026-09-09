import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Save,
  Send,
  CalendarClock,
  Image as ImageIcon,
  Film,
  CircleDot,
  FileText,
  Copy,
  Plus,
  X,
  Clock3,
  CheckCircle2,
  Library,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { accountsQuery, postsQuery, fmtDate } from "@/lib/data";
import { publishPost } from "@/lib/meta.functions";
import { MediaPicker } from "@/components/MediaPicker";
import { CaptionPicker } from "@/components/CaptionPicker";
import { PresetBar } from "@/components/PresetBar";
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
  const [captionVariants, setCaptionVariants] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");
  const [newDate, setNewDate] = useState("");

  /** Escolha de mídia inteligente: 2+ arquivos viram carrossel, 1 volta a ser post simples. */
  const applyMediaSelection = (urls: string[]) => {
    const clean = urls.filter(Boolean);
    if (clean.length === 0) return;
    if (clean.length > 1) {
      setCarousel(clean.join("\n"));
      setMediaUrl("");
      setType("CAROUSEL");
      toast.success(`${clean.length} mídias — virou carrossel automaticamente.`);
      return;
    }
    const url = clean[0] as string;
    setCarousel("");
    setMediaUrl(url);
    if (platform === "instagram" && /\.(mp4|mov)(?:\?|$)/i.test(url)) setType("REEL");
    else setType((prev) => (prev === "CAROUSEL" || prev === "REEL" ? "POST" : prev));
  };

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
    if (type === "CAROUSEL") {
      const max = isThreads ? 20 : 10;
      if (carouselUrls.length < 2) return "Um carrossel precisa de pelo menos 2 URLs públicas.";
      if (carouselUrls.length > max) return `Máximo de ${max} mídias por carrossel.`;
      if (carouselUrls.some((u) => !isPublicUrl(u))) return "Há URLs inválidas ou não públicas no carrossel.";
      return null;
    }
    if (isThreads) {
      if (!mediaUrl.trim() && !caption.trim() && !hashtags.trim())
        return "Escreva um texto ou anexe uma mídia para publicar no Threads.";
      if (mediaUrl.trim() && !isPublicUrl(mediaUrl))
        return "A URL precisa ser pública e acessível pelo Threads (http/https).";
      return null;
    }
    if (!mediaUrl.trim()) return "Informe a URL pública da mídia.";
    if (!isPublicUrl(mediaUrl)) return "A URL precisa ser pública e acessível pela Meta (http/https).";
    return null;
  })();

  const captionPool = captionVariants.length ? captionVariants : [caption];
  const captionAt = (i: number) => captionPool[i % captionPool.length] ?? caption;

  const payload = (accId: string | null, when?: string | null, captionText?: string) => ({
    account_id: accId,
    platform,
    type: isThreads ? (type === "CAROUSEL" ? "CAROUSEL" : "POST") : type,
    caption: !isThreads && type === "STORY" ? null : (captionText ?? caption) || null,
    hashtags: !isThreads && type === "STORY" ? null : hashtags || null,
    media_url: type === "CAROUSEL" ? null : mediaUrl || null,
    cover_url: !isThreads && type === "REEL" ? coverUrl || null : null,
    carousel_urls: type === "CAROUSEL" ? carouselUrls : [],
    scheduled_at: when ? new Date(when).toISOString() : null,
  });


  const savePost = async (status: string, accId: string | null, when?: string | null, captionText?: string) => {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...payload(accId, when ?? null, captionText), status })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const targetAccounts = () => (accountIds.length ? accountIds : [null]);

  const draftMutation = useMutation({
    mutationFn: async () => {
      let i = 0;
      for (const acc of targetAccounts()) {
        await savePost("draft", acc, scheduledAt || null, captionAt(i));
        i++;
      }
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
          await savePost("scheduled", acc, t, captionAt(n));
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
      let i = 0;
      for (const acc of accountIds) {
        const id = await savePost("draft", acc, null, captionAt(i));
        await publishPost({ data: { postId: id } });
        i++;
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

  const setHoursAhead = (hours: number) => {
    const d = new Date(Date.now() + hours * 60 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSchedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setSchedTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const detectedType = type === "CAROUSEL" ? "Carrossel" : type === "REEL" ? "Reel" : type === "STORY" ? "Story" : isThreads ? "Thread" : "Post";
  const mediaCount = type === "CAROUSEL" ? carouselUrls.length : mediaUrl ? 1 : 0;

  return (
    <AppShell title="Publicar" subtitle="Crie, programe e publique usando sua Biblioteca">
      <div className="mx-auto max-w-[1380px] space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-xl border border-border bg-surface p-1 shadow-sm">
            {(["instagram", "threads"] as const).map((item) => (
              <Button key={item} type="button" size="sm" variant={platform === item ? "default" : "ghost"} className="min-w-28" onClick={() => { setPlatform(item); setAccountIds([]); if (item === "threads" && type !== "CAROUSEL") setType("POST"); }}>
                {platform === item ? <CheckCircle2 /> : null}{item === "instagram" ? "Instagram" : "Threads"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" />O formato muda automaticamente conforme a mídia.</div>
        </div>

        <PresetBar platform={platform} current={() => ({ platform, type, account_ids: accountIds, caption: caption || null, caption_variants: captionVariants, hashtags: hashtags || null, media_url: mediaUrl || null, cover_url: coverUrl || null, carousel_urls: carouselUrls, default_time: schedTime || null })} onApply={(p) => { setType((p.type as typeof type) ?? "POST"); setAccountIds(p.account_ids ?? []); setCaption(p.caption ?? ""); setCaptionVariants(p.caption_variants ?? []); setHashtags(p.hashtags ?? ""); setMediaUrl(p.media_url ?? ""); setCoverUrl(p.cover_url ?? ""); setCarousel((p.carousel_urls ?? []).join("\n")); if (p.default_time) setSchedTime(p.default_time); }} />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.85fr)]">
          <div className="min-w-0 space-y-4">
            <section className="composer-panel p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase text-primary">Etapa 1</p><h2 className="font-display text-lg font-semibold">Contas e formato</h2></div>
                {!isThreads ? <div className="flex rounded-lg border border-border bg-secondary/55 p-1">{(["POST", "REEL", "STORY"] as const).map((item) => <Button key={item} type="button" size="sm" variant={type === item ? "default" : "ghost"} className="h-8" onClick={() => setType(item)}>{item === "POST" ? <ImageIcon /> : item === "REEL" ? <Film /> : <CircleDot />}{item === "POST" ? "Post" : item === "REEL" ? "Reel" : "Story"}</Button>)}</div> : null}
              </div>
              <div className="mb-2 flex items-center justify-between"><Label className="text-xs">Contas ({accountIds.length} selecionada(s))</Label>{accountList.length > 1 ? <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAccountIds(accountIds.length === accountList.length ? [] : accountList.map((a) => a.id))}>{accountIds.length === accountList.length ? "Limpar" : "Selecionar todas"}</Button> : null}</div>
              <div className="grid gap-2 rounded-lg border border-border bg-background/70 p-2 sm:grid-cols-2">
                {accountList.length === 0 ? <p className="px-2 py-4 text-xs text-muted-foreground">{isThreads ? "Nenhuma conta do Threads conectada" : "Nenhuma conta do Instagram conectada"}</p> : accountList.map((a) => <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors ${accountIds.includes(a.id) ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/40"}`}><input type="checkbox" className="accent-primary" checked={accountIds.includes(a.id)} onChange={(e) => setAccountIds((prev) => e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id))} /><span className="truncate font-medium">@{a.username}</span><span className="ml-auto text-[10px] text-muted-foreground">{a.account_type}</span></label>)}
              </div>
            </section>

            <section className="composer-panel p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-primary">Etapa 2</p><h2 className="font-display text-lg font-semibold">Mídia da publicação</h2></div><Badge className="border-primary/25 bg-primary/10 text-primary">{detectedType} · {mediaCount}</Badge></div>
              {type === "STORY" ? <div className="space-y-3"><MediaPicker kind={storyKind === "video" ? "VIDEO" : "IMAGE"} label={mediaUrl ? "Trocar mídia na Biblioteca" : "Abrir Biblioteca"} triggerClassName="h-12 w-full border-primary/30 bg-primary/10 text-primary hover:bg-primary/15" onSelect={(urls) => urls[0] && setMediaUrl(urls[0])} /><StoryEditor kind={storyKind} onKindChange={setStoryKind} value={mediaUrl} onChange={setMediaUrl} /></div> : <div className="space-y-4">
                <MediaPicker multiple={type !== "REEL"} {...(type === "REEL" ? { kind: "VIDEO" as const } : {})} label={mediaCount ? "Alterar seleção na Biblioteca" : "Abrir Biblioteca de mídias"} triggerClassName="h-28 w-full flex-col border-2 border-dashed border-primary/30 bg-primary/5 text-sm text-primary hover:border-primary hover:bg-primary/10 [&_svg]:h-7 [&_svg]:w-7" onSelect={(urls) => type === "REEL" ? urls[0] && setMediaUrl(urls[0]) : applyMediaSelection(urls)} />
                {mediaCount ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{(type === "CAROUSEL" ? carouselUrls : [mediaUrl]).map((url, index) => <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">{/\.(mp4|mov)(?:\?|$)/i.test(url) ? <video src={url} className="h-full w-full object-cover" muted /> : <img src={url} alt={`Mídia ${index + 1}`} className="h-full w-full object-cover" />}<Button type="button" size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" aria-label="Remover mídia" onClick={() => { if (type === "CAROUSEL") { const rest = carouselUrls.filter((_, i) => i !== index); if (rest.length) applyMediaSelection(rest); else { setCarousel(""); setMediaUrl(""); setType("POST"); } } else setMediaUrl(""); }}><Trash2 /></Button></div>)}</div> : <p className="text-center text-xs text-muted-foreground">Uma mídia cria um Post ou Reel. Duas ou mais criam um Carrossel automaticamente.</p>}
                {type === "REEL" ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 p-3"><span className="text-xs text-muted-foreground">Capa do Reel (opcional)</span><MediaPicker kind="IMAGE" label={coverUrl ? "Trocar capa" : "Escolher capa"} onSelect={(urls) => urls[0] && setCoverUrl(urls[0])} /></div> : null}
              </div>}
            </section>

            {type !== "STORY" ? <section className="composer-panel p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase text-primary">Etapa 3</p><h2 className="font-display text-lg font-semibold">Texto e legendas</h2></div><CaptionPicker current={caption} onUse={setCaption} onUseMany={(texts) => { setCaptionVariants(texts); if (texts[0]) setCaption(texts[0]); toast.success(`${texts.length} variações de legenda ativas.`); }} /></div>
              <Textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva a legenda..." className="bg-background/70 text-sm" />
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#marca #conteudo" className="bg-background/70" /><Button type="button" variant="secondary" onClick={() => { if (!caption.trim()) return toast.error("Escreva uma legenda para adicionar como variação."); setCaptionVariants((prev) => prev.includes(caption.trim()) ? prev : [...prev, caption.trim()]); }}><Plus />Adicionar variação</Button></div>
              {captionVariants.length ? <div className="mt-3 flex flex-wrap gap-2">{captionVariants.map((v, i) => <span key={`${v}-${i}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"><span className="max-w-72 truncate">{i + 1}. {v}</span><Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCaptionVariants((prev) => prev.filter((_, x) => x !== i))}><X /></Button></span>)}</div> : null}
            </section> : null}

            <section className="composer-panel p-4 sm:p-6"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase text-primary">Rascunhos</p><h2 className="font-display text-base font-semibold">Continuar depois</h2></div><Badge variant="secondary">{drafts.length}</Badge></div>{drafts.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Nenhum rascunho salvo.</p> : <div className="divide-y divide-border">{drafts.slice(0, 4).map((d) => <div key={d.id} className="flex items-center gap-3 py-3"><FileText className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{d.caption || "Sem legenda"}</p><p className="text-[10px] text-muted-foreground">{fmtDate(d.created_at)}</p></div><Button size="sm" variant="secondary" onClick={() => loadPost(d)}>Carregar</Button><Button size="icon" variant="ghost" aria-label="Duplicar" onClick={() => { loadPost(d); setSchedDate(""); setSchedTime(""); setExtraTimes([]); toast.info("Cópia criada — escolha os novos horários."); }}><Copy /></Button></div>)}</div>}</section>
          </div>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
            <section className="composer-panel p-4 sm:p-5">
              <div className="mb-5 flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-semibold">Programação</h2></div>
              <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">Data</Label><Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="bg-background/70" /></div><div className="space-y-1.5"><Label className="text-xs">Horário</Label><Input type="time" step={60} list="sk7-time-slots" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="bg-background/70" /></div></div>
              <p className="mb-2 mt-4 text-[10px] font-bold uppercase text-muted-foreground">Programar para daqui a</p><div className="grid grid-cols-4 gap-2">{[3,6,9,12,15,18,21,24].map((hours) => <Button key={hours} type="button" size="sm" variant="secondary" className="border-primary/15 hover:border-primary hover:bg-primary/10 hover:text-primary" onClick={() => setHoursAhead(hours)}>{hours}h</Button>)}</div>
              <div className="mt-5 rounded-lg border border-border bg-background/50 p-3"><div className="mb-3 flex items-center justify-between"><Label className="text-xs">Vários horários</Label><Badge variant="secondary">{allTimes.length}</Badge></div><div className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input type="date" value={newDate || schedDate} onChange={(e) => setNewDate(e.target.value)} className="min-w-0 bg-background" /><Input type="time" step={60} list="sk7-time-slots" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="min-w-0 bg-background" /><Button type="button" size="icon" aria-label="Adicionar horário" onClick={() => { const day = newDate || schedDate; if (!newTime || !day) return toast.error("Escolha a data e o horário."); const value = `${day}T${newTime}`; if (allTimes.includes(value)) return toast.error("Esse horário já está na lista."); setExtraTimes((prev) => [...prev, value].sort()); setNewTime(""); }}><Plus /></Button></div><datalist id="sk7-time-slots">{TIME_SLOTS.map((s) => <option key={s} value={s} />)}</datalist>{extraTimes.length ? <div className="mt-3 space-y-1.5">{extraTimes.map((item) => <div key={item} className="flex items-center justify-between rounded-md bg-secondary px-2.5 py-2 text-[11px]"><span>{fmtDate(new Date(item).toISOString())}</span><Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Remover horário" onClick={() => setExtraTimes((prev) => prev.filter((x) => x !== item))}><X /></Button></div>)}</div> : null}</div>
            </section>

            <section className="composer-panel overflow-hidden p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-base font-semibold">Prévia</h2><Badge className="border-primary/25 bg-primary/10 text-primary">{detectedType}</Badge></div><div className="overflow-hidden rounded-lg border border-border bg-background"><div className="flex items-center gap-2 border-b border-border px-3 py-2"><div className="h-6 w-6 rounded-full bg-primary" /><span className="text-xs font-medium">{account ? `@${account.username}` : "sua.conta"}</span></div><div className={`flex max-h-[320px] items-center justify-center overflow-hidden bg-surface-2 ${type === "REEL" || type === "STORY" ? "aspect-[9/16]" : "aspect-square"}`}>{type === "CAROUSEL" && carouselUrls[0] ? <img src={carouselUrls[0]} alt="Prévia do carrossel" className="h-full w-full object-cover" /> : type === "REEL" && mediaUrl ? <video src={mediaUrl} className="h-full w-full object-cover" muted /> : mediaUrl ? <img src={mediaUrl} alt="Prévia da publicação" className="h-full w-full object-cover" /> : <Library className="h-8 w-8 text-muted-foreground" />}</div>{type !== "STORY" ? <div className="p-3"><p className="line-clamp-3 whitespace-pre-wrap text-xs">{caption || "Sua legenda aparece aqui."}</p><p className="mt-1 text-xs text-primary">{hashtags}</p></div> : null}</div></section>

            {(capabilityError || mediaError) ? <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{capabilityError ?? mediaError}</div> : null}
            <section className="composer-panel space-y-2 border-primary/20 p-3"><Button className="h-12 w-full text-sm shadow-lg shadow-primary/20" disabled={busy} onClick={() => publishMutation.mutate()}><Send />Publicar agora</Button><Button className="h-11 w-full border-primary/30 bg-secondary text-foreground hover:bg-primary/10 hover:text-primary" variant="outline" disabled={busy} onClick={() => scheduleMutation.mutate()}><CalendarClock />Agendar{allTimes.length > 1 ? ` ${allTimes.length} publicações` : " publicação"}</Button><Button className="h-10 w-full" variant="ghost" disabled={busy} onClick={() => draftMutation.mutate()}><Save />Salvar rascunho</Button></section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
