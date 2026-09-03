import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-insights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!expectedKey || request.headers.get("apikey") !== expectedKey) {
          return Response.json({ success: false, error: "Não autorizado." }, { status: 401 });
        }
        const { syncInsights } = await import("@/lib/insights.server");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("instagram_accounts").select("user_id");
          const users = [...new Set((data ?? []).map((row) => row.user_id))];
          const settled = await Promise.allSettled(users.map((userId) => syncInsights(userId)));
          const results = settled.filter((row) => row.status === "fulfilled").map((row) => row.value);
          const failed = settled.filter((row) => row.status === "rejected").length;
          return Response.json({ success: failed === 0, results, failed });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao sincronizar insights.";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
