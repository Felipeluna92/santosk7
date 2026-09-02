import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runInsightsSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { syncInsights } = await import("./insights.server");
  return syncInsights(context.userId);
});

export const getIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId?: string | null }) => ({ accountId: data?.accountId ?? null }))
  .handler(async ({ data, context }) => {
    const { buildAccountIntelligence } = await import("./ai.server");
    return buildAccountIntelligence(context.userId, data.accountId);
  });

export const predictPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; format: string; dow: number; hour: number }) => data)
  .handler(async ({ data, context }) => {
    const { predictPerformance } = await import("./ai.server");
    return predictPerformance(context.userId, data);
  });

export const askAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { question: string; accountId?: string | null }) => {
    const question = typeof data?.question === "string" ? data.question.trim() : "";
    if (!question || question.length > 800) throw new Error("Pergunta inválida.");
    return { question, accountId: data?.accountId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { askIntelligence } = await import("./ai.server");
    return askIntelligence(context.userId, data.question, data.accountId);
  });

export const getLastSync = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sync_executions")
    .select("*")
    .eq("user_id", context.userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
});
