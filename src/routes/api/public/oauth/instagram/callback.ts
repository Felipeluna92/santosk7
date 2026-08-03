import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const errorReason = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        const base = process.env["APP_BASE_URL"] ?? url.origin;

        const { writeLog, exchangeCodeForAccount } = await import("@/lib/meta.server");

        if (errorReason || !code) {
          await writeLog("oauth", "error", `Autorização negada ou cancelada: ${errorReason ?? "sem code"}`);
          return Response.redirect(
            `${base}/configuracao?erro=${encodeURIComponent(errorReason ?? "Autorização cancelada.")}`,
            302,
          );
        }

        try {
          const account = await exchangeCodeForAccount(code);
          return Response.redirect(`${base}/contas?conectado=${encodeURIComponent(account.username)}`, 302);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha ao trocar o código por token.";
          await writeLog("oauth", "error", message);
          return Response.redirect(`${base}/configuracao?erro=${encodeURIComponent(message)}`, 302);
        }
      },
    },
  },
});
