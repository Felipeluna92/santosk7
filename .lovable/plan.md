# AI Cálica — Inteligência de Conteúdo

Módulo de inteligência que aprende com o histórico real de cada conta conectada.
Nada de métricas inventadas: tudo vem da API oficial da Meta, é armazenado, normalizado
e só então interpretado pela IA.

O escopo enviado é muito grande para uma única entrega. A proposta abaixo é dividida em
fases; cada fase entrega valor sozinha e a seguinte depende dos dados da anterior.

## Fase 1 — Fundação de dados (é o que destrava tudo)

Sem histórico coletado, qualquer recomendação seria texto bonito sem base. Então começa aqui.

- Coleta de mídias por conta: id, tipo (POST/REEL/CAROUSEL), legenda, hashtags,
  duração do vídeo, thumbnail, data/hora de publicação.
- Coleta de insights por mídia: views, alcance, curtidas, comentários, compartilhamentos,
  salvamentos, interações — apenas o que a API devolver para aquele tipo de conta/mídia.
- Snapshots periódicos por publicação (1h, 3h, 6h, 12h, 24h, 48h, 7d, 30d), para medir
  velocidade inicial e crescimento. Métrica ausente é gravada como "indisponível", nunca como 0.
- Snapshots diários da conta: seguidores, views, alcance, visitas ao perfil.
- Job automático a cada hora, com retry, deduplicação, registro de execução e logs.

## Fase 2 — Normalização e métricas calculadas

- Índice de desempenho por publicação (relativo à mediana da própria conta).
- Views por seguidor, alcance por seguidor, engajamento por alcance,
  salvamentos e compartilhamentos por alcance, velocidade inicial (views nas primeiras 3h).
- Perfil comportamental por conta: medianas, percentis, tendência de 30 dias,
  estado de maturidade (dados insuficientes → aprendizado inicial → intermediário → confiável).
- Toda fórmula documentada numa tela de metodologia dentro do app.

## Fase 3 — Painel "AI Cálica"

- Score da conta, tendência (crescendo / estável / caindo).
- Mapa de calor semanal (dia × faixa horária) com pontuação, média de views,
  nº de publicações na amostra e nível de confiança. Horários com amostra abaixo do
  mínimo aparecem como "amostra insuficiente", não como recomendação.
- Melhor dia, melhor formato, melhor faixa de duração de Reel, frequência recomendada.
- Melhores e piores publicações, temas em alta e em queda.
- Distinção visual clara: métrica oficial · métrica calculada · previsão · recomendação · indisponível.

## Fase 4 — Previsão e recomendações

- Previsão antes de publicar: faixa estimada de views/alcance (intervalo, nunca número único),
  nível de confiança, fatores positivos e negativos, publicações usadas como comparação.
  Baseada em vizinhos semelhantes do próprio histórico (formato, horário, duração, tema).
- "Próximo conteúdo recomendado": tema, formato, duração, abertura, legenda, CTA e horário,
  cada um com evidência e justificativa numérica vinda do backend.
- Registro de previsão × resultado real, para calibrar as próximas.
- Feedback: útil / não útil / aplicada / ignorada.

## Fase 5 — Camada generativa e conversacional

- Chat "Pergunte à sua IA": o backend calcula, a IA apenas explica. O modelo recebe um
  resumo estruturado (nunca tokens, nunca dados desnecessários) e responde citando
  período analisado, contas, dados usados e confiança.
- Análise pré-publicação do Reel: transcrição do áudio, tema, frase de abertura, ritmo,
  legibilidade da capa, comparação com os melhores conteúdos da conta.
- Relatório semanal automático com resumo, evolução, vencedores, quedas e plano da semana.
- Alertas inteligentes (queda de alcance, Reel crescendo rápido, conta parada, melhor horário mudou).

## Detalhes técnicos

- Novas tabelas: `media_insights`, `insight_snapshots`, `account_daily_metrics`,
  `content_features`, `ai_recommendations`, `ai_predictions`, `ai_reports`,
  `ai_conversations`, `ai_messages`, `intelligent_alerts`, `sync_executions`,
  `metric_availability`. Todas com RLS restrita ao dono do app, como as tabelas atuais.
- Coleta em `src/lib/insights.server.ts`; job em `src/routes/api/public/hooks/sync-insights.ts`
  agendado por cron a cada hora, respeitando rate limit com backoff.
- Cálculo estatístico em `src/lib/intelligence.server.ts` (puro TypeScript, testável).
- Camada generativa via Lovable AI (`google/gemini-3.6-flash`), recebendo apenas
  JSON estatístico já calculado. Transcrição de áudio via modelo oficial de speech-to-text.
- Nova rota `/ai` no menu lateral, no mesmo visual roxo/preto atual, responsiva para o celular.
- Testes unitários das fórmulas de normalização e do cálculo do mapa de calor.

## Como sugiro tocar

Entregar Fase 1 + 2 + o painel da Fase 3 agora. A partir do momento em que a coleta rodar,
as previsões e o chat passam a ter base real — e aí seguimos para as fases 4 e 5.
