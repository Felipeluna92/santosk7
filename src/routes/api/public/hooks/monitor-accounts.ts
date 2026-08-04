import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monitor-accounts")({
  server: {
    handlers: {
      POST: async () => {
        const { checkAccountsHealth } = await import("@/lib/monitor.server");
        try {
          const result = await checkAccountsHealth();
          return Response.json({ success: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao monitorar contas.";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
