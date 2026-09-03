import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!expectedKey || request.headers.get("apikey") !== expectedKey) {
          return Response.json({ success: false, error: "Não autorizado." }, { status: 401 });
        }
        const { publishPendingNow } = await import("@/lib/meta.server");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("instagram_accounts").select("user_id");
          const users = [...new Set((data ?? []).map((row) => row.user_id))];
          const settled = await Promise.allSettled(users.map((userId) => publishPendingNow(userId)));
          const results = settled.filter((row) => row.status === "fulfilled").map((row) => row.value);
          const result = results.reduce((sum, row) => ({
            ok: sum.ok + row.ok,
            failed: sum.failed + row.failed,
            skipped: sum.skipped + row.skipped,
            total: sum.total + row.total,
          }), { ok: 0, failed: 0, skipped: 0, total: 0 });
          return new Response(JSON.stringify({ success: settled.every((row) => row.status === "fulfilled"), ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao publicar pendentes.";
          return new Response(JSON.stringify({ success: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
