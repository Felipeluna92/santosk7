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
