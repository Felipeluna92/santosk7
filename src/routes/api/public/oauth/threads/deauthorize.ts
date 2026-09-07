import { createFileRoute } from "@tanstack/react-router";

// Endpoint público exigido pelo painel do Threads (Cancelar autorização).
// A Meta envia um POST assinado quando o usuário remove o app.
export const Route = createFileRoute("/api/public/oauth/threads/deauthorize")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }),
      POST: async () => Response.json({ ok: true }),
    },
  },
});
