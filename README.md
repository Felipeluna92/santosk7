# Insta Studio Solo

# Prompt Para Lovable: Instagram Studio Solo

Crie um app chamado **Instagram Studio Solo**.

Será usado por uma única pessoa para gerenciar uma ou poucas contas profissionais do Instagram. Não quero arquitetura empresarial pesada. Quero algo simples, bonito, funcional e fácil de manter dentro do Lovable.

## Regras Obrigatórias

- Use somente APIs oficiais da Meta/Instagram.

- Nunca use scraping, automação visual, bots de navegador, Selenium, Playwright, Puppeteer, reverse engineering ou técnicas para burlar limites.

- Não prometa recursos que a API oficial não suporta.

- Quando algo depender de permissão, tipo de conta ou versão da API, mostre uma mensagem clara de indisponibilidade.

- A primeira tela deve ser o app real, não uma landing page.

- Como é uso solo, não implemente times, RBAC, billing, multi-tenant complexo, Redis, BullMQ, Docker, NGINX ou microserviços.

## Stack No Lovable

- React + TypeScript.

- TailwindCSS + shadcn/ui.

- Lucide icons.

- Backend/server functions do Lovable/Supabase quando necessário.

- Persistência simples em tabelas do projeto.

- Secrets/env vars para credenciais sensíveis.

- Nunca expor `META_APP_SECRET` no frontend.

## Visual

Tema escuro, premium, minimalista e operacional.

Referência visual: Buffer, Later, Metricool, Hootsuite, mas em versão solo.

Use:

- Sidebar compacta.

- Cards densos.

- Tabelas simples.

- Calendário limpo.

- Estados vazios úteis.

- Toasts de sucesso e erro.

- Skeleton/loading states.

- Português brasileiro.

Evite:

- Landing page.

- Hero gigante.

- Textos explicativos excessivos fora da aba de configuração.

- Aparência genérica de template.

## Variáveis/Secrets

Criar tela de setup que instrui o usuário a configurar:

- `META_APP_ID`

- `META_APP_SECRET`

- `META_GRAPH_VERSION`, padrão `v23.0`

- `META_REDIRECT_URI`

- `APP_BASE_URL`

Esses valores sensíveis devem ser usados apenas no backend/server functions.

## Modelo De Dados Simples

Crie tabelas simples:

### settings

- id

- timezone

- locale

- meta_graph_version

- oauth_mode

- setup_completed

- created_at

- updated_at

### instagram_accounts

- id

- instagram_user_id

- username

- display_name

- profile_picture_url

- account_type

- scopes

- token_expires_at

- last_sync_at

- status

- created_at

- updated_at

Observação: token deve ser armazenado de modo server-only/seguro. Não exibir token na UI.

### media_items

- id

- title

- media_type

- public_url

- thumbnail_url

- tags

- favorite

- created_at

### posts

- id

- account_id

- type

- caption

- hashtags

- media_url

- carousel_urls

- scheduled_at

- published_at

- status

- meta_container_id

- meta_media_id

- error_message

- created_at

- updated_at

Status:

- draft

- scheduled

- publishing

- published

- failed

- cancelled

### logs

- id

- area

- level

- message

- metadata

- created_at

Redigir automaticamente em logs:

- access_token

- authorization

- secret

- password

- refresh_token

## OAuth Oficial Meta

Implementar tela **Configuração Meta** com checklist:

- Criar app no Meta Developers.

- Adicionar produto Instagram apropriado.

- Configurar redirect URI.

- Confirmar conta Instagram Business ou Creator.

- Solicitar permissões necessárias.

- Conectar via OAuth.

Implementar botão **Conectar Instagram**.

Fluxo desejado:

1. Usuário clica em Conectar Instagram.

2. Backend gera URL OAuth oficial.

3. Usuário autoriza no fluxo oficial da Meta/Instagram.

4. Callback troca `code` por access token no backend.

5. Backend busca dados básicos da conta profissional.

6. App salva conta, scopes, expiração e status.

7. UI mostra a conta conectada.

Preferir o fluxo **Instagram API with Instagram Login** quando disponível para contas Business/Creator.

Permissões configuráveis:

- `instagram_business_basic`

- `instagram_business_content_publish`

- `instagram_business_manage_comments`

Também inclua nota discreta na tela de setup:

> Dependendo do produto Meta, revisão do app e tipo de conta, algumas integrações ainda podem exigir Facebook Login + Page access token. O app deve mostrar essa limitação em vez de tentar contornar.

## Publicação Oficial

Criar composer com tabs:

- Post

- Reel

- Carrossel

- Rascunhos

Campos:

- Conta

- URL pública da mídia

- URLs do carrossel

- Legenda

- Hashtags

- Data de agendamento

- Salvar rascunho

- Publicar agora

- Agendar

Validação:

- Bloquear mídia sem URL pública.

- Explicar que a Meta precisa acessar a URL.

- Validar se a conta tem permissão de publicação.

- Validar tipo de conta Business/Creator.

Fluxo oficial de publicação:

1. Criar container via endpoint oficial `/{ig-user-id}/media`.

2. Para imagem, usar `image_url`.

3. Para vídeo/Reel, usar `video_url` e `media_type=REELS` quando aplicável.

4. Para vídeo/Reel, consultar status do container antes de publicar.

5. Publicar com `/{ig-user-id}/media_publish` e `creation_id`.

6. Salvar `meta_container_id`, `meta_media_id`, status e logs.

Carrossel:

1. Criar containers filhos oficiais com `is_carousel_item=true`.

2. Criar container pai com `media_type=CAROUSEL` e `children`.

3. Publicar container pai com `media_publish`.

Stories:

- Exibir como recurso condicional.

- Se a API/conta/permissão não suportar, mostrar indisponível.

## Agendamento Solo

Não criar fila complexa.

Criar:

- Calendário mensal simples.

- Lista de posts agendados.

- Botão **Publicar pendentes agora**.

Se não houver cron confiável no ambiente, mostrar aviso discreto:

> Para publicação automática no horário exato, configure uma função agendada/cron no Supabase ou serviço externo. Sem cron, use o botão Publicar pendentes agora.

## Telas

### Dashboard

Mostrar:

- Contas conectadas.

- Posts publicados.

- Posts agendados.

- Falhas recentes.

- Última sincronização.

- Status de setup Meta.

- Últimos logs.

### Contas

Card por conta:

- Avatar.

- Username.

- ID.

- Tipo.

- Scopes.

- Expiração do token.

- Última sincronização.

- Status.

- Botões: sincronizar, reconectar, remover.

### Composer

Tela principal de criação:

- Tabs Post/Reel/Carrossel.

- Preview simples.

- Validação de capacidade oficial.

- Botões salvar, agendar e publicar agora.

### Calendário

- Visão mensal.

- Lista lateral de pendentes.

- Editar, cancelar e publicar pendentes.

### Biblioteca

- URLs/mídias salvas.

- Tags.

- Favoritos.

- Preview.

- Botão usar no composer.

### Histórico

- Conta.

- Tipo.

- Data.

- Status.

- ID Meta.

- Erro.

- Filtros.

### Logs

- Área.

- Nível.

- Mensagem.

- Data.

- Filtros.

- Sem tokens visíveis.

### Configuração Meta

Checklist de setup, callback URL e permissões.

## Estados De Demonstração

Quando não houver conta conectada, mostrar dados de demonstração discretos para o painel não parecer vazio.

Mas deixar claro:

> Dados de demonstração. Conecte sua conta Instagram para usar dados reais.

## Segurança

- `META_APP_SECRET` somente no backend.

- Tokens nunca aparecem na interface.

- Logs com redaction.

- Validar URLs.

- Mostrar erros da Meta em linguagem humana.

- Não armazenar segredos em localStorage.

## Resultado Esperado

Um app solo, bonito e funcional para:

- Conectar conta Instagram profissional.

- Salvar URLs de mídia.

- Criar posts, Reels e carrosséis.

- Publicar usando API oficial.

- Agendar de forma simples.

- Ver histórico e logs.

- Entender claramente limitações da API.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://santosk7.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d182ffb8-223f-4408-847f-5cca15859305).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
