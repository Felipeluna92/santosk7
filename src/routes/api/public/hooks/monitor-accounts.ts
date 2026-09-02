import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monitor-accounts")({
  server: {
    handlers: {
      POST: async () => {
        const { checkAccountsHealth } = await import("@/lib/monitor.server");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("instagram_accounts").select("user_id");
          const users = [...new Set((data ?? []).map((row) => row.user_id))];
          const results = await Promise.all(users.map((userId) => checkAccountsHealth(userId)));
          return Response.json({ success: true, results });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao monitorar contas.";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
