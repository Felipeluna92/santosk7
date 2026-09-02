# Isolamento completo por login

## Objetivo
Cada usuário autenticado terá um workspace próprio. Contas conectadas, tokens, publicações, biblioteca, métricas, alertas, notificações, configurações e logs nunca serão compartilhados entre logins.

## Implementação
- Adicionar um identificador de proprietário a todas as tabelas operacionais e atribuir os dados atuais ao login principal `santosk7`.
- Substituir as regras globais de “dono do app” por políticas por linha: cada login só poderá ler, criar, alterar e apagar registros cujo proprietário seja ele mesmo.
- Tornar identificadores de conta, configurações e inscrições push únicos dentro de cada workspace, não globalmente.
- Organizar novos uploads em pastas por usuário e restringir o armazenamento autenticado à pasta do próprio login.
- Proteger todas as funções acionadas pelo painel com autenticação no servidor e validar o proprietário antes de usar acesso privilegiado.
- Propagar o proprietário em conexões de conta, publicações, logs, alertas, métricas, snapshots, sincronizações e notificações push.
- Manter os jobs automáticos globais, mas processar cada workspace separadamente e enviar notificações apenas aos dispositivos do respectivo usuário.
- Remover a antiga reivindicação global de workspace, permitindo que cada login opere normalmente sem enxergar dados de outro.

## Compatibilidade e validação
- Preservar os dados existentes no workspace `santosk7`; o login `thslz` começa com workspace vazio e configurações próprias.
- Atualizar os tipos gerados após a migração e adequar todas as consultas e mutações afetadas.
- Validar políticas, lint de segurança, login de ambos os usuários e ausência de dados cruzados nas principais telas.
