/**
 * Tipos frouxos para chamadas ao banco que ainda não existem nos tipos gerados
 * (funções RPC e colunas adicionadas por migrations recentes).
 */
export type LooseResult<T = unknown> = Promise<{ data: T; error: { message: string } | null }>;

export type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => LooseResult;
};

export type LooseFilter = {
  eq: (column: string, value: unknown) => LooseFilter & LooseResult;
  select: (columns?: string) => LooseFilter & LooseResult;
  maybeSingle: () => LooseResult;
};

export type LooseTable = {
  update: (values: Record<string, unknown>) => LooseFilter;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => LooseFilter;
  upsert: (
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: Record<string, unknown>,
  ) => LooseFilter;
};
