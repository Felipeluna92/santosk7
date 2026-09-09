// ---------------------------------------------------------------------------
// Domínio central do SK7 Command Center.
//
// Fonte única para os conceitos que atravessam UI, scheduler e serviços:
// plataformas e ciclo de vida das publicações. Nada de strings soltas de
// status/platform espalhadas pelo código.
// ---------------------------------------------------------------------------

export const PLATFORM_INSTAGRAM = "instagram" as const;
export const PLATFORM_THREADS = "threads" as const;

export type Platform = typeof PLATFORM_INSTAGRAM | typeof PLATFORM_THREADS;

export const PLATFORMS: readonly Platform[] = [PLATFORM_INSTAGRAM, PLATFORM_THREADS];

export const PLATFORM_LABEL: Record<Platform, string> = {
  [PLATFORM_INSTAGRAM]: "Instagram",
  [PLATFORM_THREADS]: "Threads",
};

export const isInstagram = (platform?: string | null): platform is typeof PLATFORM_INSTAGRAM =>
  platform === PLATFORM_INSTAGRAM;

export const isThreads = (platform?: string | null): platform is typeof PLATFORM_THREADS =>
  platform === PLATFORM_THREADS;

// ---------------------------------------------------------------------------
// Ciclo de vida de uma publicação (posts.status)
//
// draft      -> salvo pelo composer, ainda não comprometido
// scheduled  -> tem scheduled_at no futuro (ou vencido aguardando o cron)
// retrying   -> falhou de forma temporária; aguarda next_retry_at
// publishing -> assumido por um worker (lock atômico); ninguém mais publica
// published  -> publicado com sucesso na API oficial
// failed     -> falha definitiva (ou tentativas esgotadas)
// cancelled  -> cancelado pelo usuário
// ---------------------------------------------------------------------------

export const POST_STATUS_DRAFT = "draft" as const;
export const POST_STATUS_SCHEDULED = "scheduled" as const;
export const POST_STATUS_RETRYING = "retrying" as const;
export const POST_STATUS_PUBLISHING = "publishing" as const;
export const POST_STATUS_PUBLISHED = "published" as const;
export const POST_STATUS_FAILED = "failed" as const;
export const POST_STATUS_CANCELLED = "cancelled" as const;

export type PostStatus =
  | typeof POST_STATUS_DRAFT
  | typeof POST_STATUS_SCHEDULED
  | typeof POST_STATUS_RETRYING
  | typeof POST_STATUS_PUBLISHING
  | typeof POST_STATUS_PUBLISHED
  | typeof POST_STATUS_FAILED
  | typeof POST_STATUS_CANCELLED;

/** Status que o scheduler considera "devem sair sozinhos". */
export const SCHEDULER_QUEUE_STATUSES: readonly PostStatus[] = [
  POST_STATUS_SCHEDULED,
  POST_STATUS_RETRYING,
];

/**
 * Status que uma chamada manual ("publicar agora") pode assumir com lock.
 * Inclui draft (o composer salva rascunho e publica em seguida) e failed
 * (o usuário pode pedir nova tentativa no histórico).
 */
export const MANUAL_PUBLISH_CLAIMABLE: readonly PostStatus[] = [
  POST_STATUS_DRAFT,
  POST_STATUS_SCHEDULED,
  POST_STATUS_RETRYING,
  POST_STATUS_FAILED,
];

// ---------------------------------------------------------------------------
// Tipos de publicação
// ---------------------------------------------------------------------------

export const POST_TYPE_POST = "POST" as const;
export const POST_TYPE_REEL = "REEL" as const;
export const POST_TYPE_CAROUSEL = "CAROUSEL" as const;
export const POST_TYPE_STORY = "STORY" as const;

export type PostType =
  | typeof POST_TYPE_POST
  | typeof POST_TYPE_REEL
  | typeof POST_TYPE_CAROUSEL
  | typeof POST_TYPE_STORY;

export const POST_TYPE_LABEL: Record<string, string> = {
  [POST_TYPE_POST]: "Post",
  [POST_TYPE_REEL]: "Reel",
  [POST_TYPE_CAROUSEL]: "Carrossel",
  [POST_TYPE_STORY]: "Story",
  TEXT: "Thread",
};
