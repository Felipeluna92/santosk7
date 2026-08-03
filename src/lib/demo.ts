import type { Account, LogRow, MediaItem, Post } from "./data";

const now = Date.now();
const iso = (offsetHours: number) => new Date(now + offsetHours * 3600_000).toISOString();

export const demoAccounts = [
  {
    id: "demo-1",
    instagram_user_id: "17841400000000000",
    username: "estudio.demo",
    display_name: "Estúdio Demo",
    profile_picture_url: null,
    account_type: "BUSINESS",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    token_expires_at: iso(24 * 45),
    last_sync_at: iso(-2),
    status: "connected",
    created_at: iso(-720),
    updated_at: iso(-2),
  },
] as unknown as Account[];

export const demoPosts = [
  {
    id: "demo-p1",
    account_id: "demo-1",
    type: "POST",
    caption: "Bastidores da produção de hoje",
    hashtags: "#bastidores #estudio",
    media_url: "https://exemplo.com/foto.jpg",
    carousel_urls: [],
    scheduled_at: null,
    published_at: iso(-30),
    status: "published",
    meta_container_id: "1789...",
    meta_media_id: "1790...",
    error_message: null,
    created_at: iso(-36),
    updated_at: iso(-30),
  },
  {
    id: "demo-p2",
    account_id: "demo-1",
    type: "REEL",
    caption: "Tutorial rápido em 30s",
    hashtags: "#reels #dicas",
    media_url: "https://exemplo.com/video.mp4",
    carousel_urls: [],
    scheduled_at: iso(20),
    published_at: null,
    status: "scheduled",
    meta_container_id: null,
    meta_media_id: null,
    error_message: null,
    created_at: iso(-10),
    updated_at: iso(-10),
  },
  {
    id: "demo-p3",
    account_id: "demo-1",
    type: "CAROUSEL",
    caption: "5 aprendizados da semana",
    hashtags: "#carrossel",
    media_url: null,
    carousel_urls: ["https://exemplo.com/1.jpg", "https://exemplo.com/2.jpg"],
    scheduled_at: iso(-4),
    published_at: null,
    status: "failed",
    meta_container_id: null,
    meta_media_id: null,
    error_message: "A mídia não pôde ser baixada pela Meta. A URL precisa ser pública e direta.",
    created_at: iso(-12),
    updated_at: iso(-4),
  },
] as unknown as Post[];

export const demoMedia = [
  {
    id: "demo-m1",
    title: "Capa institucional",
    media_type: "IMAGE",
    public_url: "https://exemplo.com/capa.jpg",
    thumbnail_url: null,
    tags: ["marca", "capa"],
    favorite: true,
    created_at: iso(-100),
  },
] as unknown as MediaItem[];

export const demoLogs = [
  {
    id: "demo-l1",
    area: "publish",
    level: "success",
    message: "Publicado com sucesso (POST).",
    metadata: {},
    created_at: iso(-30),
  },
  {
    id: "demo-l2",
    area: "oauth",
    level: "info",
    message: "URL de autorização oficial gerada.",
    metadata: {},
    created_at: iso(-31),
  },
] as unknown as LogRow[];
