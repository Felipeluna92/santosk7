# Bot Lab — laboratório local de detecção de automação

Aplicação de cadastro/login própria, rodando só em `localhost`, com um detector
de automação no servidor e um driver Playwright com perfis de "sofisticação"
crescente. Serve para medir quais sinais pegam quais automatizadores — e quais
não pegam ninguém.

Nada aqui conversa com plataformas de terceiros: o servidor escuta em
`127.0.0.1` e o driver se recusa a rodar contra qualquer host que não seja
local.

```
bot-lab/
├── server.py            servidor HTTP (stdlib) + validação + SQLite
├── detector.py          sinais, pesos, robustez, pontuação
├── driver.py            perfis Playwright que preenchem o formulário local
├── report.py            relatório comparativo (Markdown)
├── static/
│   ├── collector.js     coleta de ambiente + comportamento no navegador
│   ├── app.js           submit dos formulários, página de resultado
│   ├── signup.html  login.html  welcome.html  style.css
├── DEFESA.md            discussão: sinais robustos × falsificáveis, melhorias
└── docs/relatorio-exemplo.md   relatório real gerado por este laboratório
```

## Rodando

Requer Python 3.10+.

```bash
cd bot-lab
pip install -r requirements.txt
python -m playwright install chromium     # se ainda não tiver um Chromium do Playwright

python server.py                          # http://localhost:8000/signup
```

Em outro terminal:

```bash
python driver.py --list                   # perfis disponíveis
python driver.py --profile all --runs 3   # todos os perfis, 3 execuções cada (cadastro + login)
python driver.py --profile humanized --runs 3 --headed   # com janela
xvfb-run -a python driver.py --profile humanized --headed  # com janela, sem display (Linux)
python report.py                          # → data/report.md
```

`--executable /caminho/chrome` (ou `LAB_CHROMIUM=...`) usa outro binário
Chromium. `--no-login` faz só o cadastro. `--seed N` torna a aleatoriedade
reproduzível.

### Linha de base humana

O relatório só faz sentido comparado com gente de verdade. Abra
`http://localhost:8000/signup` no seu navegador (sem `?label=`, vira
`manual`) e cadastre-se algumas vezes, de preferência em navegadores e
máquinas diferentes. Use `?label=manual-celular`, `?label=manual-firefox`
etc. para separar grupos. Os limiares de digitação e mouse em `detector.py`
são valores de partida: calibre-os com essas execuções.

Para ver o efeito de um POST direto na API, sem navegador:

```bash
curl -s -X POST localhost:8000/api/signup -H 'Content-Type: application/json' \
  -d '{"name":"Raw","email":"raw@example.test","password":"abc12345","confirm":"abc12345","terms":true,"telemetry":{"label":"raw-post"}}'
```

## Perfis do driver

| perfil | navegador | preenchimento | mouse |
|---|---|---|---|
| `js-spam` | headless padrão | `el.value = …` + `dispatchEvent` (inclui honeypot) | `el.click()` via JS |
| `naive` | headless padrão | `page.fill()` | `page.click()` |
| `ua-spoof` | `naive` + UA sem "HeadlessChrome" | `page.fill()` | `page.click()` |
| `inconsistent` | UA Windows em Linux, `Asia/Tokyo` + `pt-BR` | `keyboard.type(delay=100)` | linha reta, centro |
| `paced` | contexto coerente, sem flag `AutomationControlled` | `keyboard.type` char a char, pausas aleatórias | linha reta, centro |
| `humanized` | igual a `paced` | keydown/keyup com dwell gaussiano, intervalo log-normal | curva Bézier com aceleração, ponto fora do centro |

## O que é coletado

**Ambiente** (`collector.js`): `navigator.webdriver`, UA, `userAgentData`
(+ alta entropia), plataforma, idiomas, fuso e offset, tela/janela/DPR,
plugins, `window.chrome`, WebGL vendor/renderer, hash de canvas,
Notification × Permissions API, sonda de `Runtime.enable` (CDP).

**Comportamento**: mousemove (t, x, y), mousedown com deslocamento relativo ao
centro do alvo, keydown/keyup reduzidos a *campo + instante + dwell*
(nenhuma tecla ou valor é gravado), eventos `input` com `inputType`, foco,
paste, scroll, contagem de eventos com `isTrusted = false`.

**Servidor**: todos os cabeçalhos em ordem de chegada (inclui `Sec-CH-UA*`),
idade do token de formulário assinado com HMAC, honeypot.

## API local

| método | rota | |
|---|---|---|
| GET | `/signup`, `/login`, `/welcome` | páginas |
| GET | `/api/form-token` | token `ts.hmac` usado para medir tempo no servidor |
| POST | `/api/signup`, `/api/login` | `{…campos, form_token, telemetry}` → `{run_id, score, verdict}` |
| GET | `/api/runs?limit=N` | lista resumida |
| GET | `/api/runs/<id>` | sinais, features, telemetria e cabeçalhos de uma submissão |

O detector só **observa**: cadastros com pontuação alta são aceitos e gravados
mesmo assim, para que todas as execuções entrem no relatório. A página
`/welcome` mostra o veredito e os sinais da submissão — útil no laboratório,
mas é exatamente o que um site de produção **não** deve fazer (ver
`DEFESA.md`).

Dados ficam em `data/` (ignorado pelo git). Apague a pasta para recomeçar.
