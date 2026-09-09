import type { LooseRpc } from "@/lib/db-loose";
// ---------------------------------------------------------------------------
// Segurança e coordenação dos endpoints de automação (crons / hooks).
//
// Regras aplicadas em TODOS os hooks:
//  1. Método POST obrigatório.
//  2. Segredo dedicado (CRON_SECRET) via header `x-cron-secret`, comparado em
//     tempo constante. NUNCA a chave pública/anônima do Supabase.
//  3. Lock de execução no banco (cron_job_locks): se dois schedulers (ou duas
//     execuções do mesmo cron) dispararem juntos, apenas um executa o job —
//     o outro responde "skipped". Protege contra corrida entre workers e
//     contra replay de uma mesma chamada.
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from "node:crypto";

export const CRON_SECRET_HEADER = "x-cron-secret";

export type CronCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Valida método e segredo de uma requisição de cron. */
export function checkCronRequest(request: Request): CronCheck {
  if (request.method !== "POST") {
    return { ok: false, status: 405, message: "Método não permitido." };
  }
  const secret = process.env["CRON_SECRET"] ?? "";
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message:
        "Automação desativada: defina a variável CRON_SECRET no servidor e envie o header x-cron-secret nas chamadas agendadas.",
    };
  }
  const provided = request.headers.get(CRON_SECRET_HEADER);
  if (!provided) {
    return { ok: false, status: 401, message: "Autenticação ausente." };
  }
  if (!safeEqual(secret, provided)) {
    return { ok: false, status: 401, message: "Autenticação inválida." };
  }
  return { ok: true };
}

/**
 * Executa um job de cron sob lock exclusivo no banco.
 * - Outra execução em andamento (lease vivo)  -> responde skipped (200).
 * - Função de lock inexistente no banco        -> 503 avisando a migração.
 * - Falha do handler                           -> 500 com a mensagem.
 * O lease é sempre liberado no final (ou expira sozinho pelo TTL se o
 * processo morrer no meio).
 */
export async function runCronJob(
  jobName: string,
  handler: () => Promise<Record<string, unknown>>,
  ttlSeconds = 240,
): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const acquire = await (supabaseAdmin as unknown as LooseRpc).rpc("acquire_cron_lock", {
    p_job_name: jobName,
    p_ttl_seconds: ttlSeconds,
  });

  if (acquire.error) {
    console.error(`[cron:${jobName}] lock indisponível`, acquire.error.message);
    return Response.json(
      {
        success: false,
        error:
          "Lock de cron indisponível no banco. Aplique a migration de publish pipeline e cron locks.",
      },
      { status: 503 },
    );
  }

  const token = acquire.data as string | null;
  if (!token) {
    return Response.json(
      { success: false, skipped: true, error: "Outra execução deste job já está em andamento." },
      { status: 200 },
    );
  }

  try {
    const result = await handler();
    return Response.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha na execução do job.";
    console.error(`[cron:${jobName}] erro`, message);
    return Response.json({ success: false, error: message }, { status: 500 });
  } finally {
    try {
      await (supabaseAdmin as unknown as LooseRpc).rpc("release_cron_lock", {
        p_job_name: jobName,
        p_token: token,
      });
    } catch (err) {
      console.error(`[cron:${jobName}] falha ao liberar lock`, err);
    }
  }
}
