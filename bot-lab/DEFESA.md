# Discussão defensiva

Baseada no relatório real em `docs/relatorio-exemplo.md`: 42 submissões
(cadastro + login) feitas com Chromium 153 do Playwright em Linux, headless e
com janela via Xvfb, mais um POST direto na API. **Não há linha de base humana
nesse relatório.** Os limiares de digitação e mouse ainda não foram calibrados
contra pessoas, e qualquer taxa de falso positivo citada abaixo é estimativa,
não medição.

## 1. O que o laboratório mostrou

| perfil | pontuação | o que denunciou |
|---|---:|---|
| `js-spam` | 100 (bruta 225) | honeypot, `isTrusted=false`, webdriver, headless, 0,6 s até o submit |
| `naive` | 100 (185) | webdriver, "HeadlessChrome", campos sem tecla, mouse teletransportado, 0,6 s |
| `ua-spoof` | 100 (145) | igual ao `naive`, menos a marca de headless |
| `inconsistent` | 100 (138) | SO incoerente (UA=Windows, `navigator.platform`=Linux), CV do ritmo de digitação 0,007, mouse em reta perfeita |
| `paced` | 70 | dwell mediano de 1,7 ms, mouse em reta, clique no centro |
| `humanized` | 20–35 | só sinais de "máquina de laboratório" (WebGL por software, janela sem moldura) e, às vezes, ritmo regular |

A conclusão incômoda: **com umas 40 linhas de Python (`Actor` em `driver.py`),
o perfil `humanized` cai em "humano provável" em 4 de 6 submissões.** Tudo o
que o detector olha numa sessão isolada pode ser imitado. O que separa
`humanized` dos outros não é o detector ser bom, e sim o custo que ele impôs:
cerca de 45–50 s por cadastro + login, contra 1,8 s do `naive` — uns 25× menos
vazão por instância de navegador.

## 2. Sinais: robustos × fáceis de falsificar

### Fáceis de falsificar (uma opção ou flag)

- **`navigator.webdriver`**: sumiu com `--disable-blink-features=AutomationControlled`
  (`paced`, `humanized`). Pega só quem não se deu ao trabalho.
- **Marca de headless no UA**: `user_agent=` resolve. No Chromium 153 o
  `Sec-CH-UA` já vem como `"Chromium"`, sem marca headless, então trocar só o UA
  basta (`ua-spoof`).
- **Idioma e fuso**: `locale` e `timezone_id` do Playwright mudam cabeçalho,
  `navigator.languages`, `Intl` e `getTimezoneOffset` juntos, de forma coerente.
  `lang_mismatch` e `tz_offset` nunca dispararam.
- **Plugins, `window.chrome`, permissões**: artefatos do headless antigo. O
  headless novo do Chrome já os corrige — nunca dispararam. Ainda dá para
  mantê-los no detector, com peso baixo.
- **Janela sem moldura**: disparou em 100% dos perfis, inclusive com janela
  em Xvfb, porque o Playwright iguala `screen` ao viewport por padrão. Ajustar a
  opção `screen` no contexto apaga o sinal.

### Moderados (exigem trabalho ou consistência)

- **Coerência entre camadas** (UA × `navigator.platform` × `userAgentData` ×
  `Sec-CH-UA-Platform`): pegou o `inconsistent` em 100% das vezes. Quem falsifica
  uma superfície costuma esquecer outra. Quem não falsifica nada (`native`)
  passa.
- **WebGL por software** (SwiftShader / WebGL ausente): 100% dos perfis do
  Playwright, mas também acontece com usuários reais em VM, RDP, VDI ou
  com aceleração de hardware desligada. Use como contexto, não como veredito.
- **Dinâmica de teclado**: `fill()` não gera keydown, `keyboard.type()` sem
  atraso tem dwell de ~2 ms, `delay=100` tem CV ≈ 0. Pega quem usa as primitivas
  do Playwright como vêm, mas um dwell gaussiano com intervalo log-normal
  (`humanized`) passa. `flight_regular` ainda pegou o `humanized` em 2 de 12
  submissões, com CV entre 0,24 e 0,29, perto do limiar de 0,25. Sem linha de
  base humana não dá para saber se esse limiar é bom.
- **Mouse**: o `page.click()` puro "teletransporta" o mouse (1–2 mousemoves) e
  acerta o centro do elemento. `mouse.move(steps=N)` gera reta perfeita
  (retidão 1,0). Uma curva Bézier com aceleração passa (retidão ≈ 0,99).
- **Sonda de CDP (`Runtime.enable` via getter de `Error.stack`)**: **não
  disparou nesta build do Chromium**, mesmo com o Playwright conectado.
  Considere o sinal morto até achar uma variante que funcione na versão atual.
- **`mouse_burst`** (mousemove mais rápido que o refresh): nunca disparou. O
  Chromium alinha os mousemove injetados via CDP aos frames (mediana de 16,7 ms
  em todos os perfis), então eles chegam no mesmo ritmo dos de um mouse real.
  Esse sinal só pegaria eventos sintéticos de outra origem.

### Robustos (difíceis de falsificar — mas atenção ao que medem)

- **Tempo medido pelo servidor** (token HMAC emitido no carregamento): não dá
  para forjar editando a telemetria. Em compensação, o atacante só precisa
  esperar. É robusto na *integridade*, não no *poder de discriminação*: sua
  função real é impor custo de tempo.
- **Telemetria ausente**: pega POST direto na API (`raw-post`). Força o
  atacante a rodar um navegador inteiro, o que já é um ganho grande de custo.
- **`isTrusted = false`**: nenhum script da página consegue forjá-lo. Mas
  eventos injetados via CDP (Playwright, Puppeteer) chegam como confiáveis, então
  ele só pega bots que operam dentro da página (`js-spam`).
- **Honeypot**: zero falso positivo na prática e pega 100% dos bots genéricos
  de formulário, mas nenhum bot feito para o seu site.

## 3. A lição estrutural: telemetria do cliente é entrada do atacante

Todo o bloco `telemetry` é JSON enviado pelo cliente. Um atacante que leia
`collector.js` pode mandar um POST direto com uma telemetria "humana" gravada
de uma sessão real, e o detector desta versão vai aceitar. Daí:

1. **Confie primeiro no que o servidor observa sozinho**: cabeçalhos e a ordem
   deles, tempo do token, IP/ASN, TLS. A telemetria do cliente serve para
   *corroborar* esses dados, não para substituí-los.
2. **Cruze a telemetria com os fatos do servidor**: o UA do cabeçalho bate com o
   do JS? O fuso bate com a geolocalização do IP? O tempo que o cliente diz ter
   levado bate com a idade do token?
3. **Amarre a telemetria à sessão**: assine com um nonce do servidor, ofusque e
   rotacione o coletor e as sondas. Isso não dá segurança criptográfica (o
   cliente controla tudo), mas obriga o atacante a refazer o trabalho a cada
   rotação.

## 4. Como um site melhoraria a detecção

Por ordem de retorno sobre esforço:

1. **Agregação entre sessões.** O relatório mostra o sinal mais forte que o
   detector *não* pontua: dentro de cada perfil, as 6 sessões têm fingerprint
   idêntico (canvas, WebGL, UA, tela, fuso, CPU), e o maior grupo idêntico tem
   12 sessões. Usuários reais divergem. Contar cadastros por fingerprint, sub-rede
   ou ASN e domínio de e-mail numa janela de tempo pega exatamente o que
   `humanized` não consegue esconder: escala. Falsificar fingerprints distintos
   *e coerentes* para cada sessão custa muito mais do que imitar uma digitação.
2. **Rede e transporte.** Fingerprint de TLS (JA3/JA4), de HTTP/2 (SETTINGS,
   ordem de pseudo-cabeçalhos) e de TCP/IP (estilo p0f), comparados ao SO e ao
   navegador que o UA declara. TLS e HTTP/2 denunciam cliente que diz ser
   Chrome sem ser (bibliotecas HTTP, outros motores). O fingerprint TCP/IP (TTL
   inicial, opções e janela de TCP) denuncia o `inconsistent`: UA de Windows
   com pilha de rede de Linux, mesmo com todo o JS corrigido. O Chrome usa o
   mesmo TLS em todos os sistemas, então só o JA4 não pegaria esse caso. Isso
   exige um proxy ou terminador que exponha esses dados (o `http.server` daqui
   não expõe).
3. **Modelos de população em vez de limiares.** O `humanized` sorteia
   intervalos de distribuições fixas, *independentes do par de teclas*. Na
   digitação real, a latência depende do dígrafo ("de" é mais rápido que
   "qz") e o ritmo muda dentro do campo (hesitação antes do @, rajadas em
   palavras conhecidas). Um modelo treinado nas execuções `manual` que compare
   a latência por dígrafo pega distribuições sintéticas que passam em
   mediana e CV. O mesmo vale para o mouse: overshoot e correção perto do alvo,
   micro-pausas, curvatura que varia com a distância.
4. **Fricção progressiva, não bloqueio binário.** Pontuação baixa passa; média
   recebe um desafio (prova de trabalho, CAPTCHA, confirmação de e-mail com
   reputação do domínio); alta é bloqueada ou entra em quarentena. Ganha-se
   no custo do atacante sem punir o usuário legítimo que cai num falso positivo
   (VM sem GPU, gerenciador de senhas que preenche sem tecla).
5. **Não dar oráculo ao atacante.** A `/welcome` do laboratório mostra pontuação
   e sinais; em produção isso é um painel de ajuste para quem ataca. Responda
   igual para todos, atrase a decisão e aplique as consequências depois do fato
   (contas sombreadas, limites silenciosos).
6. **Sinais pós-cadastro.** O comportamento da conta nos dias seguintes
   (cadência, grafo de interações, reutilização de fingerprint no login)
   acumula evidência que uma sessão de cadastro sozinha não tem.
7. **Atestação quando houver.** Private Access Tokens / Privacy Pass na web,
   Play Integrity e App Attest em apps: transferem parte da prova de "dispositivo
   real" para o sistema operacional.

## 5. Próximos experimentos sugeridos

- Coletar 20+ execuções `manual` em máquinas e navegadores variados e
  recalibrar `dwell`, `flight_regular`, `mouse_linear` e `click_center`;
  depois medir os falsos positivos de verdade.
- Implementar a pontuação de agregação (fingerprints repetidos numa janela de
  tempo) no detector, além do relatório.
- Adicionar latência por dígrafo à telemetria (sem gravar as teclas: só a
  classe do par, por exemplo mão alternada × mesma mão) e verificar se ela
  separa `humanized` das execuções `manual`.
- Pôr um terminador TLS que exponha JA4 e um coletor de fingerprint TCP
  (p0f) na frente do servidor e cruzar os dois com o SO declarado pelo
  `inconsistent`.
