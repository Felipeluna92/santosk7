import { createServerFn } from "@tanstack/react-start";

export const runInsightsSync = createServerFn({ method: "POST" }).handler(async () => {
  const { syncInsights } = await import("./insights.server");
  return syncInsights();
});

export const getIntelligence = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId?: string | null }) => ({ accountId: data?.accountId ?? null }))
  .handler(async ({ data }) => {
    const { buildAccountIntelligence } = await import("./ai.server");
    return buildAccountIntelligence(data.accountId);
  });

export const predictPost = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId: string; format: string; dow: number; hour: number }) => data)
  .handler(async ({ data }) => {
    const { predictPerformance } = await import("./ai.server");
    return predictPerformance(data);
  });

export const askAi = createServerFn({ method: "POST" })
  .inputValidator((data: { question: string; accountId?: string | null }) => {
    const question = typeof data?.question === "string" ? data.question.trim() : "";
    if (!question || question.length > 800) throw new Error("Pergunta inválida.");
    return { question, accountId: data?.accountId ?? null };
  })
  .handler(async ({ data }) => {
    const { askIntelligence } = await import("./ai.server");
    return askIntelligence(data.question, data.accountId);
  });

export const getLastSync = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sync_executions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
});
