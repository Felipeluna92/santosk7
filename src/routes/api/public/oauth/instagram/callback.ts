import { createFileRoute } from "@tanstack/react-router";

// OAuth incorporado permanece desativado. A conexão suportada é por token manual.
export const Route = createFileRoute("/api/public/oauth/instagram/callback")({
  server: {
    handlers: {
      GET: async () =>
        new Response("OAuth desativado. Use a conexão por token manual no painel.", {
          status: 410,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});