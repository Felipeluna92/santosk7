// Server-only Web Push helpers (VAPID). Never import from client code.
import { buildPushPayload } from "@block65/webcrypto-web-push";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function vapid() {
  return {
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:alerts@lovable.app",
    publicKey: process.env["VAPID_PUBLIC_KEY"] ?? undefined,
    privateKey: process.env["VAPID_PRIVATE_KEY"] ?? undefined,
  };
}

export function vapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}

/** Sends a notification to every registered device. Removes dead subscriptions. */
export async function sendPushToAll(payload: PushPayload) {
  const keys = vapid();
  if (!keys.publicKey || !keys.privateKey) return { sent: 0, failed: 0, reason: "vapid-missing" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  let sent = 0;
  let failed = 0;

  for (const sub of subs ?? []) {
    const subscription = {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      const init = await buildPushPayload(
        { data: payload, options: { ttl: 60 * 60 * 12, urgency: "high" } },
        subscription,
        keys,
      );
      const res = await fetch(sub.endpoint, init as RequestInit);
      if (res.status === 404 || res.status === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        failed++;
      } else if (!res.ok) {
        failed++;
      } else {
        sent++;
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
