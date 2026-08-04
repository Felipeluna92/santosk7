import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-insights")({
  server: {
    handlers: {
      POST: async () => {
        const { syncInsights } = await import("@/lib/insights.server");
        try {
          const result = await syncInsights();
          return Response.json({ success: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao sincronizar insights.";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
