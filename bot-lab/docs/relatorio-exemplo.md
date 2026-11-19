# Relatório do laboratório de detecção

Gerado em 2026-11-19 03:31 · 43 submissões · cadastro + login

`pontuação` é limitada a 100; `bruta` é a soma de todos os pesos disparados, útil para comparar perfis que estouram o teto.

## Resumo por perfil

| perfil | n | pontuação (média) | faixa | bruta (média) | vereditos |
|---|---:|---:|---|---:|---|
| js-spam | 6 | 100.0 | 100–100 | 225 | bot provável ×6 |
| naive | 6 | 100.0 | 100–100 | 185 | bot provável ×6 |
| ua-spoof | 6 | 100.0 | 100–100 | 145 | bot provável ×6 |
| inconsistent | 6 | 100.0 | 100–100 | 138 | bot provável ×6 |
| paced | 6 | 70.0 | 70–70 | 70 | bot provável ×6 |
| humanized | 6 | 25.0 | 20–35 | 25 | humano provável ×4, suspeito ×2 |
| humanized-headed | 6 | 25.0 | 20–35 | 25 | humano provável ×4, suspeito ×2 |
| raw-post | 1 | 70.0 | 70–70 | 70 | bot provável ×1 |

## Métricas comportamentais (medianas)

| perfil | tempo até submit (s) | dwell mediano (ms) | flight mediano (ms) | CV do flight | mousemoves | retidão do mouse | dist. clique↔centro |
|---|---:|---:|---:|---:|---:|---:|---:|
| js-spam | 0.6 | – | – | – | 0 | – | – |
| naive | 0.6 | – | – | – | 1.5 | – | 0.027 |
| ua-spoof | 0.6 | – | – | – | 1.5 | – | 0.027 |
| inconsistent | 8.3 | 102 | 103.2 | 0.007 | 94.5 | 1 | 0.037 |
| paced | 18.3 | 1.7 | 152.6 | 0.38 | 94.5 | 1 | 0.026 |
| humanized | 22.9 | 99.3 | 215.8 | 0.286 | 59 | 0.9901 | 0.258 |
| humanized-headed | 23.5 | 102 | 226.6 | 0.259 | 55 | 0.9851 | 0.306 |
| raw-post | – | – | – | – | 0 | – | – |

## Diversidade de fingerprint entre sessões

Valores distintos por componente dentro de cada perfil. Usuários reais divergem; várias contas com o fingerprint inteiro idêntico apontam para a mesma origem.

| perfil | sessões | canvas | webgl | ua | tela | fuso | cpu | fingerprint completo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| js-spam | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| naive | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| ua-spoof | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| inconsistent | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| paced | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| humanized | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| humanized-headed | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Maior grupo com fingerprint completo idêntico na base inteira: **12 sessões** de 42.

## Sinais × perfis (% das submissões em que o sinal disparou)

| sinal | categoria | robustez | peso | js-spam | naive | ua-spoof | inconsistent | paced | humanized | humanized-headed | raw-post |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Telemetria ausente | servidor | robusto | 40 | · | · | · | · | · | · | · | 100% |
| Honeypot preenchido | servidor | moderado | 50 | 50% | · | · | · | · | · | · | · |
| Tempo de formulário (token do servidor) | servidor | robusto | variável | 100% | 100% | 100% | 50% | · | · | · | 100% |
| navigator.webdriver = true | ambiente | fácil de falsificar | 40 | 100% | 100% | 100% | 100% | · | · | · | · |
| Marca de headless no UA / client hints | ambiente | fácil de falsificar | 40 | 100% | 100% | · | · | · | · | · | · |
| Artefato de CDP (Runtime.enable) | ambiente | moderado | 25 | · | · | · | · | · | · | · | · |
| UA do cabeçalho ≠ navigator.userAgent | ambiente | fácil de falsificar | 25 | · | · | · | · | · | · | · | · |
| Sistema operacional incoerente | ambiente | moderado | 25 | · | · | · | 100% | · | · | · | · |
| Versão do Chrome incoerente (UA × client hints) | ambiente | moderado | 15 | · | · | · | · | · | · | · | · |
| Accept-Language ≠ navigator.languages | ambiente | fácil de falsificar | 10 | · | · | · | · | · | · | · | · |
| Fuso horário improvável para o idioma | ambiente | fácil de falsificar | 5 | 100% | 100% | 100% | 100% | · | · | · | · |
| Offset do relógio ≠ fuso declarado | ambiente | moderado | 15 | · | · | · | · | · | · | · | · |
| Janela sem moldura (outer = inner / tela = viewport) | ambiente | fácil de falsificar | 10 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | · |
| Viewport maior que a tela | ambiente | moderado | 15 | · | · | · | · | · | · | · | · |
| WebGL por software / indisponível | ambiente | moderado | 10 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | · |
| Permissões incoerentes (Notification × Permissions API) | ambiente | moderado | 15 | · | · | · | · | · | · | · | · |
| Sem plugins em Chrome desktop | ambiente | fácil de falsificar | 5 | · | · | · | · | · | · | · | · |
| window.chrome ausente em UA Chrome | ambiente | fácil de falsificar | 10 | · | · | · | · | · | · | · | · |
| Eventos sintéticos (isTrusted = false) | comportamento | robusto | 40 | 100% | · | · | · | · | · | · | · |
| Campos preenchidos sem teclas | comportamento | moderado | 20 | 100% | 100% | 100% | · | · | · | · | · |
| Tecla pressionada por tempo sobre-humano | comportamento | moderado | 25 | · | · | · | · | 100% | · | · | · |
| Digitação rápida demais | comportamento | moderado | 15 | · | · | · | · | · | · | · | · |
| Ritmo de digitação regular demais | comportamento | moderado | 15 | · | · | · | 100% | · | 33% | 17% | · |
| Cliques sem nenhum movimento de mouse | comportamento | moderado | 25 | · | · | · | · | · | · | · | · |
| Mouse 'teletransportado' até o alvo | comportamento | moderado | 20 | · | 100% | 100% | · | · | · | · | · |
| Trajetória de mouse em linha reta | comportamento | moderado | 15 | · | · | · | 100% | 100% | · | 17% | · |
| Eventos de mouse mais rápidos que o refresh da tela | comportamento | moderado | 15 | · | · | · | · | · | · | · | · |
| Cliques exatamente no centro do elemento | comportamento | moderado | 10 | · | 50% | 50% | 100% | 100% | · | · | · |

## Leitura automática

- **Nunca dispararam** (sem poder de discriminação nesta amostra, ou já neutralizados): Artefato de CDP (Runtime.enable); UA do cabeçalho ≠ navigator.userAgent; Versão do Chrome incoerente (UA × client hints); Accept-Language ≠ navigator.languages; Offset do relógio ≠ fuso declarado; Viewport maior que a tela; Permissões incoerentes (Notification × Permissions API); Sem plugins em Chrome desktop; window.chrome ausente em UA Chrome; Digitação rápida demais; Cliques sem nenhum movimento de mouse; Eventos de mouse mais rápidos que o refresh da tela.
- **js-spam** foi pego por: Tempo de formulário (token do servidor), navigator.webdriver = true, Marca de headless no UA / client hints, Fuso horário improvável para o idioma, Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Eventos sintéticos (isTrusted = false), Campos preenchidos sem teclas, Honeypot preenchido.
- **naive** foi pego por: Tempo de formulário (token do servidor), navigator.webdriver = true, Marca de headless no UA / client hints, Fuso horário improvável para o idioma, Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Campos preenchidos sem teclas, Mouse 'teletransportado' até o alvo, Cliques exatamente no centro do elemento.
- **ua-spoof** foi pego por: Tempo de formulário (token do servidor), navigator.webdriver = true, Fuso horário improvável para o idioma, Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Campos preenchidos sem teclas, Mouse 'teletransportado' até o alvo, Cliques exatamente no centro do elemento.
- **inconsistent** foi pego por: navigator.webdriver = true, Sistema operacional incoerente, Fuso horário improvável para o idioma, Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Ritmo de digitação regular demais, Trajetória de mouse em linha reta, Cliques exatamente no centro do elemento, Tempo de formulário (token do servidor).
- **paced** foi pego por: Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Tecla pressionada por tempo sobre-humano, Trajetória de mouse em linha reta, Cliques exatamente no centro do elemento.
- **humanized** foi pego por: Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Ritmo de digitação regular demais.
- **humanized-headed** foi pego por: Janela sem moldura (outer = inner / tela = viewport), WebGL por software / indisponível, Trajetória de mouse em linha reta, Ritmo de digitação regular demais.
- **raw-post** foi pego por: Telemetria ausente, Tempo de formulário (token do servidor).

> Sem execuções `manual` nesta base. Abra `http://localhost:8000/signup` no seu navegador e cadastre-se algumas vezes para ter a linha de base humana e calibrar os limiares.
