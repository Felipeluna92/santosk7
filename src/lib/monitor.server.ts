// Server-only account health monitoring using the official Instagram Graph API.
import { humanizeMetaError, readMetaEnv, writeLog } from "./meta.server";
import { sendPushToAll } from "./push.server";

type CheckResult = {
  accountId: string;
  username: string;
  ok: boolean;
  message: string | null;
};

/** Classifies the failure so the notification is actionable. */
function classify(message: string): { kind: string; label: string } {
  const m = message.toLowerCase();
  if (m.includes("expirou") || m.includes("revogad") || m.includes("token")) {
    return { kind: "token", label: "Token expirado ou revogado" };
  }
  if (m.includes("permiss")) return { kind: "permission", label: "Permissão insuficiente" };
  if (m.includes("limit") || m.includes("rate")) return { kind: "rate_limit", label: "Limite da API atingido" };
  return { kind: "unreachable", label: "Conta indisponível" };
}

export async function checkAccountsHealth() {
  const env = readMetaEnv();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, username, status");

  const results: CheckResult[] = [];

  for (const acc of accounts ?? []) {
    const { data: tokenRow } = await supabaseAdmin
      .from("account_tokens")
      .select("access_token")
      .eq("account_id", acc.id)
      .maybeSingle();

    let ok = false;
    let message: string | null = null;

    if (!tokenRow?.access_token) {
      message = "Nenhum token salvo para esta conta. Reconecte na tela de Configuração.";
    } else {
      try {
        const res = await fetch(
          `https://graph.instagram.com/${env.graphVersion}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(
            tokenRow.access_token,
          )}`,
        );
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || json["error"]) {
          message = humanizeMetaError(json);
        } else {
          ok = true;
        }
      } catch {
        message = "Não foi possível falar com a API da Meta agora.";
      }
    }

    results.push({ accountId: acc.id, username: acc.username, ok, message });

    const { data: openAlert } = await supabaseAdmin
      .from("account_alerts")
      .select("id, kind")
      .eq("account_id", acc.id)
      .is("resolved_at", null)
      .maybeSingle();

    if (!ok && message) {
      const { kind, label } = classify(message);
      await supabaseAdmin
        .from("instagram_accounts")
        .update({ status: "restricted", last_sync_at: new Date().toISOString() })
        .eq("id", acc.id);

      if (!openAlert) {
        await supabaseAdmin.from("account_alerts").insert({
          account_id: acc.id,
          kind,
          severity: "error",
          message,
        });
        await writeLog("monitor", "error", `@${acc.username}: ${message}`, { accountId: acc.id });
        await sendPushToAll({
          title: `⚠️ @${acc.username} — ${label}`,
          body: message,
          url: "/contas",
          tag: `account-${acc.id}`,
        });
      }
    } else if (ok) {
      await supabaseAdmin
        .from("instagram_accounts")
        .update({ status: "connected", last_sync_at: new Date().toISOString() })
        .eq("id", acc.id);

      if (openAlert) {
        await supabaseAdmin
          .from("account_alerts")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", openAlert.id);
        await writeLog("monitor", "success", `@${acc.username} voltou ao normal.`, { accountId: acc.id });
        await sendPushToAll({
          title: `✅ @${acc.username} normalizada`,
          body: "A conta voltou a responder à API oficial da Meta.",
          url: "/contas",
          tag: `account-${acc.id}`,
        });
      }
    }
  }

  return {
    checked: results.length,
    down: results.filter((r) => !r.ok).length,
    results,
  };
}
