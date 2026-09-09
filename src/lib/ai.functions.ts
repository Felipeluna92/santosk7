import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runInsightsSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { syncInsights } = await import("./collect.server");
  // Sincronização profunda: preenche/completa até 30 dias de histórico oficial.
  return syncInsights(context.userId, { deep: true });
});

export const getGrowthHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildGrowthHealthReport } = await import("./ai.server");
    return buildGrowthHealthReport(context.userId);
  });

export const getIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string | null }) => ({
    accountId: data?.accountId ?? null,
  }))
  .handler(async ({ context, data }) => {
    const { buildAccountIntelligence } = await import("./ai.server");
    return buildAccountIntelligence(context.userId, data.accountId);
  });

export const askAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { question: string; accountId: string | null }) => {
    const question = String(data?.question ?? "").trim().slice(0, 800);
    if (!question) throw new Error("Escreva uma pergunta.");
    return { question, accountId: data?.accountId ?? null };
  })
  .handler(async ({ context, data }) => {
    const { askIntelligence } = await import("./ai.server");
    return askIntelligence(context.userId, data.question, data.accountId);
  });

export const getLastSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sync_executions")
      .select("started_at, media_upserted, errors, status")
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });
