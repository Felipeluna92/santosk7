import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        const payload = JSON.stringify({
          type: error ? "sk7InstagramOAuthError" : "sk7InstagramOAuthComplete",
          code: code ?? null,
          state: state ?? null,
          error: error ?? null,
        }).replace(/</g, "\\u003c");
        const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão Instagram — SK7</title></head><body style="margin:0;font-family:system-ui;background:#f5f7fb;color:#182230;display:grid;place-items:center;min-height:100vh"><main style="text-align:center;padding:32px"><h1 style="font-size:20px">Finalizando conexão…</h1><p style="color:#667085">Você já pode voltar para a SK7.</p></main><script>if(window.opener){window.opener.postMessage(${payload},'*');window.close()}</script></body></html>`;
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
          },
        });
      },
    },
  },
});