# Command Center e Saúde de Crescimento

## Objetivo
Reformular toda a interface como um **Command Center claro**, moderno e orientado a decisões, preservando as funções atuais. Criar uma nova área de **Saúde das Contas** que mede potencial de crescimento e viralização de 0 a 100 com base apenas em métricas oficiais já coletadas.

## Nova experiência visual
- Trocar o tema escuro por uma identidade clara com fundo cinza suave, superfícies brancas, texto grafite, azul premium e verde-água como apoio.
- Aplicar Space Grotesk nos títulos e DM Sans no restante da interface.
- Reorganizar o shell: sidebar agrupada por contexto no desktop, barra de navegação inferior no celular e cabeçalho mais enxuto.
- Mover a ação principal “Nova publicação” para uma posição persistente e prioritária; deixar ações secundárias no contexto de cada página.
- Atualizar cards, tabelas, filtros, formulários, diálogos, estados vazios, badges, skeletons e feedbacks para o mesmo sistema visual.
- Reformular as páginas Painel, Contas, Publicar, Calendário, Biblioteca, Histórico, IA, Logs, Configuração e Login sem alterar seus fluxos funcionais.
- Garantir boa leitura e alvos de toque no Galaxy S24 FE / largura de 400 px.

## Saúde das Contas: crescimento e viralização
- Criar uma página dedicada “Saúde”, acessível pela navegação e pela página de Contas.
- Calcular uma nota explicável de 0 a 100 por conta, sem prometer viralização, dividida em dimensões como:
  - **Tração**: tendência recente de alcance e visualizações.
  - **Engajamento qualificado**: interações por alcance, com peso maior para compartilhamentos e salvamentos.
  - **Consistência**: frequência e regularidade nas últimas semanas.
  - **Potencial de descoberta**: visualizações/alcance em relação à base de seguidores e desempenho dos melhores conteúdos.
  - **Aproveitamento de formato e horário**: aderência aos formatos e horários que historicamente performam melhor na própria conta.
- Ajustar a nota conforme disponibilidade e volume de dados, exibindo também a confiança da análise; métrica ausente nunca será tratada como zero.
- Mostrar score geral, notas por dimensão, resumo do diagnóstico, pontos fortes, prioridades de melhoria e ações práticas em português brasileiro.
- Exibir a amostra analisada, período e última coleta para deixar o resultado auditável.
- Integrar o diagnóstico à inteligência existente e permitir atualizar os insights antes de recalcular.
- Cobrir contas novas ou com poucos dados com estado de “diagnóstico inicial”, orientando quais dados ainda faltam.

## Segurança e confiabilidade
- Manter todo diagnóstico isolado por login e calculado no servidor sobre dados do próprio usuário.
- Usar somente dados da API oficial da Meta e cálculos determinísticos; a IA pode explicar os resultados, mas não inventar métricas nem definir a nota.
- Corrigir o endpoint público de monitoramento para não aceitar execuções não autorizadas e evitar falha global quando uma conta apresentar erro.
- Corrigir o problema atual de hidratação da tela de login durante a reformulação.

## Implementação técnica
- Evoluir os tokens globais em `src/styles.css`, os componentes-base e o `AppShell` antes das telas, mantendo classes sem valores de cor soltos.
- Criar funções puras e testáveis para score, confiança e recomendações no módulo de inteligência, com testes para ausência de métricas, amostra pequena e limites 0–100.
- Expor o diagnóstico por função autenticada do servidor e renderizá-lo em uma nova rota protegida.
- Reutilizar as consultas e o histórico existentes (`ig_media`, `account_daily_metrics`) sem criar coleta paralela ou scraping.
- Validar os fluxos principais em desktop e 400 px, checar console, estados vazios, carregamento e responsividade.
