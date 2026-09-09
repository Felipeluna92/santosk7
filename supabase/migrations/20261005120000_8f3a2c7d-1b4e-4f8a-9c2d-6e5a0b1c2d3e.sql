-- ===========================================================================
-- Publicação confiável + segurança dos crons (SK7 Command Center)
--
-- 1. posts: colunas do pipeline de publicação (tentativas, retry, timeout)
-- 2. Índices da fila de publicação
-- 3. cron_job_locks + funções de lock exclusivo para os hooks de automação
-- 4. Função de claim atômico de publicação (idempotência entre workers)
--
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Pipeline de publicação em posts
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

COMMENT ON COLUMN public.posts.attempt_count IS 'Quantas vezes a publicação já foi assumida por um worker (claim).';
COMMENT ON COLUMN public.posts.last_attempt_at IS 'Início da última tentativa de publicação.';
COMMENT ON COLUMN public.posts.next_retry_at IS 'Próximo horário permitido para nova tentativa (status retrying).';
COMMENT ON COLUMN public.posts.processing_started_at IS 'Quando o worker assumiu a publicação (usado p/ recuperar travados).';

-- Estado consistente: impede status inventados pelas futuras integrações.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posts_status_valid'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_status_valid
      CHECK (status IN ('draft', 'scheduled', 'retrying', 'publishing', 'published', 'failed', 'cancelled'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Índices da fila
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS posts_queue_idx
  ON public.posts (status, scheduled_at)
  WHERE status IN ('scheduled', 'retrying') AND account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_retry_due_idx
  ON public.posts (next_retry_at)
  WHERE status = 'retrying';

CREATE INDEX IF NOT EXISTS posts_publishing_stale_idx
  ON public.posts (updated_at)
  WHERE status = 'publishing';

CREATE INDEX IF NOT EXISTS posts_user_created_idx
  ON public.posts (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Lock exclusivo de cron (anti-corrida entre workers e anti-replay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_job_locks (
  job_name   text PRIMARY KEY,
  token      text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.cron_job_locks IS 'Lease exclusivo por job de automação (publish-scheduled, sync-insights, monitor-accounts, ...).';

ALTER TABLE public.cron_job_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cron_job_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cron_job_locks TO service_role;

-- Adquire o lease; devolve um token se conseguiu (ou se o lease anterior já
-- expirou e pode ser tomado). Devolve NULL se outra execução está viva.
CREATE OR REPLACE FUNCTION public.acquire_cron_lock(p_job_name text, p_ttl_seconds integer DEFAULT 300)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.cron_job_locks (job_name, token, expires_at)
  VALUES (p_job_name, v_token, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (job_name) DO NOTHING;

  IF FOUND THEN
    RETURN v_token;
  END IF;

  UPDATE public.cron_job_locks
     SET token = v_token,
         started_at = now(),
         expires_at = now() + make_interval(secs => p_ttl_seconds)
   WHERE job_name = p_job_name
     AND expires_at <= now();

  IF FOUND THEN
    RETURN v_token;
  END IF;

  RETURN NULL;
END;
$$;

-- Libera o lease (apenas o dono do token consegue apagar).
CREATE OR REPLACE FUNCTION public.release_cron_lock(p_job_name text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.cron_job_locks
   WHERE job_name = p_job_name
     AND token = p_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_cron_lock(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lock(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.release_cron_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Claim atômico de publicação (idempotência)
--
-- Move posts -> publishing numa única instrução condicional. Se dois workers
-- tentarem publicar o mesmo post ao mesmo tempo, apenas um ganha o lock e
-- incrementa attempt_count. O outro recebe claimed=false.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_post_for_publish(
  p_post_id uuid,
  p_owner_id uuid,
  p_statuses text[]
)
RETURNS TABLE(claimed boolean, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
BEGIN
  UPDATE public.posts
     SET status = 'publishing',
         attempt_count = attempt_count + 1,
         last_attempt_at = now(),
         processing_started_at = now(),
         error_message = NULL,
         updated_at = now()
   WHERE id = p_post_id
     AND user_id = p_owner_id
     AND status = ANY (p_statuses)
   RETURNING attempt_count INTO v_attempt;

  IF v_attempt IS NULL THEN
    RETURN QUERY SELECT false, 0;
  ELSE
    RETURN QUERY SELECT true, v_attempt;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_for_publish(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_for_publish(uuid, uuid, text[]) TO service_role;


