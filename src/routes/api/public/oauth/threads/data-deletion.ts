import { createFileRoute } from "@tanstack/react-router";

// Endpoint público exigido pelo painel do Threads (Exclusão de dados).
// Responde com a confirmação no formato esperado pela Meta.
export const Route = createFileRoute("/api/public/oauth/threads/data-deletion")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json({
          url: new URL(request.url).origin + "/api/public/oauth/threads/data-deletion",
          confirmation_code: "sk7-" + Date.now().toString(36),
        }),
      POST: async ({ request }) =>
        Response.json({
          url: new URL(request.url).origin + "/api/public/oauth/threads/data-deletion",
          confirmation_code: "sk7-" + Date.now().toString(36),
        }),
    },
  },
});
