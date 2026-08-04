CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_owner ON public.push_subscriptions FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));

CREATE TABLE public.account_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_alerts TO authenticated;
GRANT ALL ON public.account_alerts TO service_role;
ALTER TABLE public.account_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_alerts_owner ON public.account_alerts FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE INDEX account_alerts_open_idx ON public.account_alerts (account_id, kind) WHERE resolved_at IS NULL;