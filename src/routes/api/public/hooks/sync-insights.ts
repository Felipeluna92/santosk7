import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-insights")({
  server: {
    handlers: {
      POST: async () => {
        const { syncInsights } = await import("@/lib/insights.server");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("instagram_accounts").select("user_id");
          const users = [...new Set((data ?? []).map((row) => row.user_id))];
          const results = await Promise.all(users.map((userId) => syncInsights(userId)));
          return Response.json({ success: true, results });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao sincronizar insights.";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
