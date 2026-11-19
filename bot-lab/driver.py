"""Driver Playwright do laboratório — preenche o cadastro/login LOCAL.

Só aceita alvos em localhost/127.0.0.1. Cada perfil é uma configuração de
navegador + estratégia de preenchimento; o nome do perfil (com sufixo
"-headed" quando há janela) vai em ?label= e aparece no relatório.

    python driver.py --profile all --runs 3
    python driver.py --profile humanized --runs 5 --headed      # precisa de display (ou xvfb-run)
    python driver.py --list

Perfis:
    js-spam      bot de formulário genérico: valores e cliques via JS, preenche o honeypot
    naive        headless padrão, page.fill(), clique direto
    ua-spoof     naive + troca só o User-Agent (remove "HeadlessChrome")
    inconsistent UA de Windows, fuso de Tóquio, idioma pt-BR, digitação com atraso fixo
    paced        contexto coerente, pausas aleatórias entre campos, keyboard.type com atraso aleatório
    humanized    contexto coerente, teclas com dwell, mouse em curva, cliques fora do centro
"""

from __future__ import annotations

import argparse
import math
import os
import random
import secrets
import sys
import time
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, sync_playwright

DEFAULT_EXECUTABLE = os.environ.get("LAB_CHROMIUM") or (
    "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
)


@dataclass
class Profile:
    name: str
    description: str
    typing: str                      # js | fill | fixed | jitter | human
    mouse: str = "direct"            # js | direct | linear | curved
    think: tuple[float, float] = (0.0, 0.0)  # pausa entre campos (s)
    launch_args: list[str] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    ua: str | None = None            # "strip-headless" | "windows" | "native" | None


PROFILES = {
    p.name: p
    for p in [
        Profile(
            "js-spam",
            "Bot de formulário genérico: preenche todo input via JS (inclui o honeypot) e dispara eventos sintéticos.",
            typing="js",
            mouse="js",
        ),
        Profile("naive", "Headless padrão, fill(), sem pausas.", typing="fill"),
        Profile("ua-spoof", "Igual ao naive, só troca o User-Agent.", typing="fill", ua="strip-headless"),
        Profile(
            "inconsistent",
            "UA de Windows em Linux, fuso Asia/Tokyo com pt-BR, digitação com atraso fixo de 100 ms.",
            typing="fixed",
            mouse="linear",
            ua="windows",
            context={"locale": "pt-BR", "timezone_id": "Asia/Tokyo", "viewport": {"width": 1920, "height": 1080}},
        ),
        Profile(
            "paced",
            "Contexto coerente, pausas de 1–3 s entre campos, keyboard.type com atraso aleatório.",
            typing="jitter",
            mouse="linear",
            think=(1.0, 3.0),
            ua="native",
            launch_args=["--disable-blink-features=AutomationControlled"],
            context={
                "locale": "pt-BR",
                "timezone_id": "America/Sao_Paulo",
                "viewport": {"width": 1366, "height": 768},
            },
        ),
        Profile(
            "humanized",
            "Contexto coerente, teclas com dwell variável, mouse em curva com aceleração, cliques fora do centro.",
            typing="human",
            mouse="curved",
            think=(0.8, 2.5),
            ua="native",
            launch_args=["--disable-blink-features=AutomationControlled"],
            context={
                "locale": "pt-BR",
                "timezone_id": "America/Sao_Paulo",
                "viewport": {"width": 1366, "height": 768},
            },
        ),
    ]
}


# --- movimento e digitação -----------------------------------------------------------

class Actor:
    """Executa as ações de um perfil numa página, rastreando a posição do mouse."""

    def __init__(self, page: Page, profile: Profile, rng: random.Random):
        self.page, self.p, self.rng = page, profile, rng
        vp = page.viewport_size or {"width": 1280, "height": 720}
        self.pos = (rng.uniform(0.2, 0.8) * vp["width"], rng.uniform(0.2, 0.8) * vp["height"])

    def think(self):
        lo, hi = self.p.think
        if hi > 0:
            time.sleep(self.rng.uniform(lo, hi))

    def _target_point(self, selector: str) -> tuple[float, float]:
        box = self.page.locator(selector).bounding_box()
        if self.p.mouse != "curved":
            return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        # ponto gaussiano em torno do centro, preso aos 70% internos do elemento
        gx = max(-0.7, min(0.7, self.rng.gauss(0, 0.3)))
        gy = max(-0.7, min(0.7, self.rng.gauss(0, 0.3)))
        return box["x"] + box["width"] / 2 * (1 + gx), box["y"] + box["height"] / 2 * (1 + gy)

    def _curve_to(self, x: float, y: float):
        x0, y0 = self.pos
        dist = math.hypot(x - x0, y - y0)
        # um ponto de controle deslocado perpendicularmente → curva quadrática
        mx, my = (x0 + x) / 2, (y0 + y) / 2
        nx, ny = (-(y - y0) / dist, (x - x0) / dist) if dist else (0, 0)
        bend = self.rng.uniform(-0.25, 0.25) * dist
        cx, cy = mx + nx * bend, my + ny * bend
        steps = max(8, int(dist / self.rng.uniform(10, 18)))
        for i in range(1, steps + 1):
            t = i / steps
            t = 10 * t**3 - 15 * t**4 + 6 * t**5  # perfil de velocidade "minimum jerk"
            px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t**2 * x
            py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t**2 * y
            self.page.mouse.move(px + self.rng.gauss(0, 0.4), py + self.rng.gauss(0, 0.4))
            time.sleep(self.rng.uniform(0.008, 0.02))
        self.pos = (x, y)

    def click(self, selector: str):
        if self.p.mouse == "js":
            self.page.eval_on_selector(selector, "el => el.click()")  # evento sintético, isTrusted=false
            return
        if self.p.mouse == "direct":
            self.page.click(selector)  # Playwright move o mouse direto ao centro e clica
            return
        x, y = self._target_point(selector)
        if self.p.mouse == "linear":
            self.page.mouse.move(x, y, steps=20)  # reta, passos sem intervalo entre si
            self.pos = (x, y)
            self.page.mouse.click(x, y)
            return
        self._curve_to(x, y)
        time.sleep(self.rng.uniform(0.05, 0.2))
        self.page.mouse.down()
        time.sleep(self.rng.uniform(0.06, 0.14))
        self.page.mouse.up()

    def type_into(self, selector: str, text: str):
        if self.p.typing == "js":
            self.page.eval_on_selector(
                selector,
                "(el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }",
                text,
            )
            return
        if self.p.typing == "fill":
            self.page.fill(selector, text)
            return
        self.click(selector)
        if self.p.typing == "fixed":
            self.page.keyboard.type(text, delay=100)
        elif self.p.typing == "jitter":
            for ch in text:
                self.page.keyboard.type(ch)
                time.sleep(self.rng.uniform(0.05, 0.25))
        else:  # human: keydown, segura (dwell), keyup, intervalo log-normal
            for ch in text:
                self.page.keyboard.down(ch)
                time.sleep(max(0.03, self.rng.gauss(0.095, 0.025)))
                self.page.keyboard.up(ch)
                time.sleep(min(0.9, self.rng.lognormvariate(math.log(0.12), 0.45)))


# --- fluxo -------------------------------------------------------------------------

def build_ua(kind: str | None, version: str) -> str | None:
    major = version.split(".")[0]
    if kind == "strip-headless" or kind == "native":
        return f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"
    if kind == "windows":
        return f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"
    return None


def fetch_result(page: Page, base: str, kind: str) -> dict:
    """Espera a página pós-submit e busca o veredito pelo run id da URL."""
    page.wait_for_url("**/welcome**", timeout=15000)
    run_id = parse_qs(urlparse(page.url).query)["run"][0]
    run = page.request.get(f"{base}/api/runs/{run_id}").json()
    return {"kind": kind, "run_id": run["id"], "score": run["score"], "verdict": run["verdict"]}


def run_once(pw, base: str, profile: Profile, idx: int, headed: bool, executable: str | None,
             do_login: bool, rng: random.Random) -> list[dict]:
    browser = pw.chromium.launch(headless=not headed, executable_path=executable, args=profile.launch_args)
    try:
        ctx_opts = dict(profile.context)
        ua = build_ua(profile.ua, browser.version)
        if ua:
            ctx_opts["user_agent"] = ua
        ctx = browser.new_context(**ctx_opts)
        page = ctx.new_page()
        actor = Actor(page, profile, rng)

        # dados de teste locais; domínio .test é reservado e nunca resolve
        tag = secrets.token_hex(3)
        name = rng.choice(["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado"])
        email = f"lab-{profile.name}-{idx}-{tag}@example.test"
        password = f"Lab{tag}{rng.randint(10, 99)}x"
        label = profile.name + ("-headed" if headed else "")
        results = []

        page.goto(f"{base}/signup?label={label}")
        page.wait_for_load_state("networkidle")
        for sel, val in [("#name", name), ("#email", email), ("#password", password), ("#confirm", password)]:
            actor.think()
            actor.type_into(sel, val)
        if profile.typing == "js":
            actor.type_into("#website", "https://example.test")  # robô genérico preenche tudo que é input
        actor.think()
        actor.click("#terms")
        actor.think()
        actor.click("#submit")
        results.append(fetch_result(page, base, "signup"))

        if do_login:
            page.goto(f"{base}/login?label={label}")
            page.wait_for_load_state("networkidle")
            for sel, val in [("#email", email), ("#password", password)]:
                actor.think()
                actor.type_into(sel, val)
            actor.think()
            actor.click("#submit")
            results.append(fetch_result(page, base, "login"))
        ctx.close()
        return results
    finally:
        browser.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--profile", default="all", help="nome do perfil ou 'all'")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--headed", action="store_true", help="navegador com janela (use xvfb-run sem display)")
    ap.add_argument("--no-login", action="store_true", help="só cadastro, sem o fluxo de login")
    ap.add_argument("--executable", default=DEFAULT_EXECUTABLE, help="binário Chromium (padrão: o do Playwright)")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for p in PROFILES.values():
            print(f"{p.name:13} {p.description}")
        return

    host = urlparse(args.base).hostname
    if host not in ("localhost", "127.0.0.1", "::1"):
        sys.exit(f"Recusado: o driver só roda contra o laboratório local (recebido host={host!r}).")

    names = list(PROFILES) if args.profile == "all" else [args.profile]
    unknown = [n for n in names if n not in PROFILES]
    if unknown:
        sys.exit(f"Perfil desconhecido: {unknown}. Use --list.")

    rng = random.Random(args.seed)
    with sync_playwright() as pw:
        for name in names:
            for i in range(1, args.runs + 1):
                t0 = time.time()
                for r in run_once(pw, args.base, PROFILES[name], i, args.headed, args.executable,
                                  not args.no_login, rng):
                    print(f"{name:13} #{i} {r['kind']:6} run={r.get('run_id')} score={r.get('score'):>3} "
                          f"{r.get('verdict')}  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
