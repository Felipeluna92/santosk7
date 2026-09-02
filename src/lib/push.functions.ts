import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPushConfig = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { vapidPublicKey } = await import("./push.server");
  const key = vapidPublicKey();
  return { publicKey: key, ready: Boolean(key) };
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; label?: string }) => {
    if (!data?.endpoint?.startsWith("https://")) throw new Error("Inscrição inválida.");
    if (!data.p256dh || !data.auth) throw new Error("Inscrição incompleta.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        label: data.label ?? null,
      },
      { onConflict: "user_id,endpoint" },
    );
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", data.endpoint).eq("user_id", context.userId);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { sendPushToUser } = await import("./push.server");
  return sendPushToUser(context.userId, {
    title: "Instagram Studio · teste",
    body: "As notificações de queda e restrição estão ativas neste aparelho.",
    url: "/contas",
    tag: "test",
  });
});

export const runAccountsHealthCheck = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { checkAccountsHealth } = await import("./monitor.server");
  return checkAccountsHealth(context.userId);
});

export const getOpenAlerts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("account_alerts")
    .select("id, kind, severity, message, created_at, instagram_accounts(username)")
    .eq("user_id", context.userId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    severity: a.severity,
    message: a.message,
    created_at: a.created_at,
    username: (a as { instagram_accounts?: { username?: string } }).instagram_accounts?.username ?? null,
  }));
});
