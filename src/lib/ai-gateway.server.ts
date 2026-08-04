import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Provider do Lovable AI Gateway. Chave lida apenas no servidor. */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}
