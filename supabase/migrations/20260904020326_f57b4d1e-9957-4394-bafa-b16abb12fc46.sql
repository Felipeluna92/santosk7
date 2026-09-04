ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';

ALTER TABLE public.instagram_accounts
  DROP CONSTRAINT IF EXISTS instagram_accounts_platform_check;

ALTER TABLE public.instagram_accounts
  ADD CONSTRAINT instagram_accounts_platform_check
  CHECK (platform IN ('instagram', 'threads'));

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_platform_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_platform_check
  CHECK (platform IN ('instagram', 'threads'));

CREATE UNIQUE INDEX IF NOT EXISTS instagram_accounts_user_platform_uid_idx
  ON public.instagram_accounts (user_id, platform, instagram_user_id);

CREATE INDEX IF NOT EXISTS posts_user_platform_idx
  ON public.posts (user_id, platform, scheduled_at);