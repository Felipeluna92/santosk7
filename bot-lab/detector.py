"""Detector de automação do laboratório.

`analyze(telemetry, headers, server_ctx)` recebe a telemetria do coletor
(static/collector.js), os cabeçalhos HTTP da submissão e o contexto que só o
servidor conhece (idade do token de formulário, honeypot) e devolve:

    {"score": 0..100, "verdict": str, "signals": [...], "features": {...}}

Cada sinal declara categoria, peso e *robustez* — quão caro é para um
automatizador neutralizá-lo. A discussão completa está em DEFESA.md.
"""

from __future__ import annotations

import re
import statistics as st
from dataclasses import asdict, dataclass

EASY = "fácil de falsificar"
MODERATE = "moderado"
ROBUST = "robusto"

ENV = "ambiente"
BEHAVIOR = "comportamento"
SERVER = "servidor"

TEXT_FIELDS = {"name", "email", "password", "confirm"}

# região do idioma -> prefixos de fuso plausíveis (lista curta, de propósito)
REGION_TZ = {
    "BR": ("America/",),
    "PT": ("Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"),
    "US": ("America/", "Pacific/Honolulu"),
    "GB": ("Europe/London",),
    "ES": ("Europe/Madrid", "Atlantic/Canary", "Africa/Ceuta"),
    "DE": ("Europe/Berlin", "Europe/Busingen"),
    "FR": ("Europe/Paris",),
    "IT": ("Europe/Rome",),
    "JP": ("Asia/Tokyo",),
    "MX": ("America/",),
    "AR": ("America/",),
}


@dataclass
class Signal:
    id: str
    title: str
    category: str
    robustness: str
    weight: int
    triggered: bool = False
    detail: str = ""


# --- helpers -----------------------------------------------------------------------

def _header(headers: list[list[str]], name: str) -> str | None:
    name = name.lower()
    for k, v in headers:
        if k.lower() == name:
            return v
    return None


def _ua_os(ua: str) -> str | None:
    if not ua:
        return None
    if "Windows NT" in ua:
        return "Windows"
    if re.search(r"iPhone|iPad|iPod", ua):
        return "iOS"
    if "Mac OS X" in ua:
        return "macOS"
    if "Android" in ua:
        return "Android"
    if "CrOS" in ua:
        return "ChromeOS"
    if "Linux" in ua or "X11" in ua:
        return "Linux"
    return None


def _platform_os(platform: str | None) -> str | None:
    if not platform:
        return None
    p = platform.strip('"').lower()
    if p.startswith("win"):
        return "Windows"
    if p.startswith("mac"):
        return "macOS"
    if p in ("iphone", "ipad", "ipod", "ios"):
        return "iOS"
    if p == "android":
        return "Android"
    if p in ("chrome os", "chromeos", "cros"):
        return "ChromeOS"
    if "linux" in p:
        return "Linux"  # Android também reporta "Linux armv8l" em navigator.platform
    return None


def _ua_chrome_major(ua: str) -> int | None:
    m = re.search(r"(?:Headless)?Chrome/(\d+)", ua or "")
    return int(m.group(1)) if m else None


def _median(xs):
    return st.median(xs) if xs else None


def _cv(xs):
    if len(xs) < 2:
        return None
    mean = st.fmean(xs)
    return st.pstdev(xs) / mean if mean > 0 else None


def _r(x, nd=1):
    return None if x is None else round(x, nd)


# --- features comportamentais ------------------------------------------------------

def behavior_features(beh: dict) -> dict:
    keys = beh.get("keys") or []
    inputs = beh.get("inputs") or []
    mouse = beh.get("mouse") or []
    clicks = beh.get("clicks") or []

    dwells = [k["dwell"] for k in keys if isinstance(k.get("dwell"), (int, float))]

    # flight = intervalo keydown→keydown no mesmo campo; pausas > 2 s são "pensar", não digitar
    flights = []
    by_field: dict[str, list[float]] = {}
    for k in keys:
        by_field.setdefault(k.get("field") or "?", []).append(k["t"])
    for ts in by_field.values():
        ts.sort()
        flights += [b - a for a, b in zip(ts, ts[1:]) if 0 <= b - a <= 2000]

    fields_with_input = {i.get("field") for i in inputs} & TEXT_FIELDS
    fields_with_keys = {k.get("field") for k in keys}
    no_key_fields = sorted(fields_with_input - fields_with_keys)

    # segmentos de mouse: quebra em pausas > 250 ms
    segments, cur = [], []
    for p in mouse:
        if cur and p[0] - cur[-1][0] > 250:
            segments.append(cur)
            cur = []
        cur.append(p)
    if cur:
        segments.append(cur)

    straightness, intervals = [], []
    for seg in segments:
        if len(seg) < 6:
            continue
        path = sum(((b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2) ** 0.5 for a, b in zip(seg, seg[1:]))
        chord = ((seg[-1][1] - seg[0][1]) ** 2 + (seg[-1][2] - seg[0][2]) ** 2) ** 0.5
        if path >= 50:
            straightness.append(chord / path)
        intervals += [b[0] - a[0] for a, b in zip(seg, seg[1:])]

    # movimentos de mouse no 1 s anterior a cada clique
    pre_moves = [sum(1 for p in mouse if c["t"] - 1000 <= p[0] <= c["t"]) for c in clicks]
    center_dist = [max(abs(c.get("dx", 0)), abs(c.get("dy", 0))) for c in clicks if c.get("w")]

    return {
        "n_keys": len(keys),
        "dwell_median_ms": _r(_median(dwells)),
        "flight_median_ms": _r(_median(flights)),
        "flight_cv": _r(_cv(flights), 3),
        "n_flights": len(flights),
        "fields_without_keys": no_key_fields,
        "n_mouse": len(mouse),
        "n_mouse_segments": len(segments),
        "mouse_straightness_median": _r(_median(straightness), 4),
        "mouse_interval_median_ms": _r(_median(intervals)),
        "n_clicks": len(clicks),
        "pre_click_moves": pre_moves,
        "click_center_dist_median": _r(_median(center_dist), 3),
        "untrusted_events": beh.get("untrusted", 0),
        "first_interaction_ms": beh.get("firstInteraction"),
        "pastes": beh.get("pastes", 0),
    }


# --- análise -----------------------------------------------------------------------

def analyze(telemetry: dict, headers: list[list[str]], server_ctx: dict) -> dict:
    env = telemetry.get("env") or {}
    beh = telemetry.get("behavior") or {}
    f = behavior_features(beh)
    f["form_age_s"] = _r(server_ctx.get("form_age_s"), 2)
    f["telemetry_present"] = bool(env)

    S: list[Signal] = []

    def sig(*a, **kw) -> Signal:
        s = Signal(*a, **kw)
        S.append(s)
        return s

    ua_js = env.get("userAgent") or ""
    ua_hdr = _header(headers, "User-Agent") or ""
    ch_ua = _header(headers, "Sec-CH-UA") or ""
    ch_platform = _header(headers, "Sec-CH-UA-Platform")
    accept_lang = _header(headers, "Accept-Language") or ""
    ua_data = env.get("uaData") or {}

    # -- servidor ---------------------------------------------------------------
    s = sig("no_telemetry", "Telemetria ausente", SERVER, ROBUST, 40)
    if not env:
        s.triggered, s.detail = True, "POST direto na API, sem executar o JavaScript da página."

    s = sig("honeypot", "Honeypot preenchido", SERVER, MODERATE, 50)
    if server_ctx.get("honeypot"):
        s.triggered, s.detail = True, "Campo invisível 'website' veio preenchido."

    age = server_ctx.get("form_age_s")
    s = sig("form_timing", "Tempo de formulário (token do servidor)", SERVER, ROBUST, 0)
    if age is None:
        s.triggered, s.weight, s.detail = True, 30, "Token de formulário ausente ou inválido."
    elif age < 3:
        s.triggered, s.weight, s.detail = True, 35, f"Submetido {age:.2f}s após o carregamento."
    elif age < 8:
        s.triggered, s.weight, s.detail = True, 15, f"Submetido {age:.2f}s após o carregamento."
    else:
        s.weight = 35

    # -- ambiente ---------------------------------------------------------------
    s = sig("webdriver", "navigator.webdriver = true", ENV, EASY, 40)
    if env.get("webdriver") is True:
        s.triggered, s.detail = True, "Flag de automação exposta pelo navegador."

    s = sig("headless_ua", "Marca de headless no UA / client hints", ENV, EASY, 40)
    if "Headless" in ua_js or "Headless" in ua_hdr or "Headless" in ch_ua:
        s.triggered, s.detail = True, f"UA: {ua_hdr[:90]} | Sec-CH-UA: {ch_ua[:90]}"

    s = sig("cdp_runtime", "Artefato de CDP (Runtime.enable)", ENV, MODERATE, 25)
    if env.get("cdpRuntime") is True:
        s.triggered, s.detail = True, "console.debug serializou o objeto: há um cliente CDP/DevTools escutando."

    s = sig("ua_header_js", "UA do cabeçalho ≠ navigator.userAgent", ENV, EASY, 25)
    if env and ua_hdr and ua_js and ua_hdr != ua_js:
        s.triggered, s.detail = True, f"header={ua_hdr[:70]} | js={ua_js[:70]}"

    s = sig("os_mismatch", "Sistema operacional incoerente", ENV, MODERATE, 25)
    oses = {
        "UA": _ua_os(ua_js or ua_hdr),
        "navigator.platform": _platform_os(env.get("platform")),
        "userAgentData.platform": _platform_os(ua_data.get("platform")),
        "Sec-CH-UA-Platform": _platform_os(ch_platform),
    }
    known = {k: v for k, v in oses.items() if v}
    distinct = set(known.values())
    if distinct == {"Android", "Linux"} and known.get("navigator.platform") == "Linux":
        distinct = {"Android"}  # Android reporta navigator.platform "Linux armv8l"
    if len(distinct) > 1:
        s.triggered, s.detail = True, ", ".join(f"{k}={v}" for k, v in known.items())

    s = sig("version_mismatch", "Versão do Chrome incoerente (UA × client hints)", ENV, MODERATE, 15)
    ua_major = _ua_chrome_major(ua_js or ua_hdr)
    brand_majors = {
        int(b["version"]) for b in (ua_data.get("brands") or [])
        if re.search(r"Chrom", b.get("brand", "")) and str(b.get("version", "")).isdigit()
    }
    if ua_major and brand_majors and ua_major not in brand_majors:
        s.triggered, s.detail = True, f"UA diz {ua_major}, brands dizem {sorted(brand_majors)}"
    if ua_major and ua_major >= 90 and env and not ua_data:
        # Chromium ≥ 90 em contexto seguro expõe userAgentData; ausência sugere UA forjado em outro motor
        s.triggered, s.detail = True, f"UA diz Chrome {ua_major}, mas navigator.userAgentData não existe."

    s = sig("lang_mismatch", "Accept-Language ≠ navigator.languages", ENV, EASY, 10)
    langs = env.get("languages") or []
    hdr_first = accept_lang.split(",")[0].split(";")[0].strip().lower()
    if langs and hdr_first and hdr_first.split("-")[0] != str(langs[0]).lower().split("-")[0]:
        s.triggered, s.detail = True, f"header={hdr_first} | js={langs[0]}"

    s = sig("tz_locale", "Fuso horário improvável para o idioma", ENV, EASY, 5)
    tz = env.get("timezone") or ""
    lang0 = str(langs[0]) if langs else str(env.get("language") or "")
    region = lang0.split("-")[1].upper() if "-" in lang0 else None
    if region in REGION_TZ and tz and not tz.startswith(REGION_TZ[region]):
        s.triggered, s.detail = True, f"idioma={lang0}, fuso={tz}"

    s = sig("tz_offset", "Offset do relógio ≠ fuso declarado", ENV, MODERATE, 15)
    if env.get("tzOffset") is not None and env.get("tzOffsetIntl") is not None \
            and env["tzOffset"] != env["tzOffsetIntl"]:
        s.triggered, s.detail = True, f"getTimezoneOffset={env['tzOffset']}, Intl({tz})={env['tzOffsetIntl']}"

    s = sig("frameless_window", "Janela sem moldura (outer = inner / tela = viewport)", ENV, EASY, 10)
    w, sc = env.get("window") or {}, env.get("screen") or {}
    notes = []
    if w and w.get("outerWidth") == 0:
        notes.append("outerWidth=0")
    elif w and w.get("outerWidth") == w.get("innerWidth") and w.get("outerHeight") == w.get("innerHeight"):
        notes.append(f"outer=inner={w.get('innerWidth')}x{w.get('innerHeight')}")
    if sc and w and sc.get("width") == w.get("innerWidth") and sc.get("height") == w.get("innerHeight"):
        notes.append("tela = viewport")
    mobile = bool(ua_data.get("mobile")) or _ua_os(ua_js) in ("Android", "iOS")
    if notes and not mobile:
        s.triggered, s.detail = True, ", ".join(notes)

    s = sig("viewport_gt_screen", "Viewport maior que a tela", ENV, MODERATE, 15)
    if sc and w and (w.get("innerWidth", 0) > sc.get("width", 1e9) or w.get("innerHeight", 0) > sc.get("height", 1e9)):
        s.triggered, s.detail = True, f"viewport {w.get('innerWidth')}x{w.get('innerHeight')} > tela {sc.get('width')}x{sc.get('height')}"

    s = sig("software_gl", "WebGL por software / indisponível", ENV, MODERATE, 10)
    gl = env.get("webgl") or {}
    renderer = str(gl.get("renderer") or "")
    if env and (not gl.get("available") or re.search(r"SwiftShader|llvmpipe|softpipe|Software", renderer, re.I)):
        s.triggered, s.detail = True, renderer or "WebGL indisponível"

    s = sig("permissions", "Permissões incoerentes (Notification × Permissions API)", ENV, MODERATE, 15)
    perm = env.get("permissions") or {}
    if perm.get("notification") == "denied" and perm.get("query") == "prompt":
        s.triggered, s.detail = True, "Notification.permission=denied mas permissions.query=prompt"

    s = sig("no_plugins", "Sem plugins em Chrome desktop", ENV, EASY, 5)
    if env and not mobile and "Chrome" in ua_js and env.get("pluginsLength") == 0:
        s.triggered, s.detail = True, "navigator.plugins.length = 0"

    s = sig("no_chrome_object", "window.chrome ausente em UA Chrome", ENV, EASY, 10)
    if env and "Chrome" in ua_js and env.get("hasChromeObject") is False:
        s.triggered, s.detail = True, "UA diz Chrome, mas window.chrome não existe."

    # -- comportamento ----------------------------------------------------------
    s = sig("untrusted", "Eventos sintéticos (isTrusted = false)", BEHAVIOR, ROBUST, 40)
    if f["untrusted_events"]:
        s.triggered, s.detail = True, f"{f['untrusted_events']} eventos disparados por script."

    s = sig("fill_without_keys", "Campos preenchidos sem teclas", BEHAVIOR, MODERATE, 20)
    if f["fields_without_keys"]:
        s.triggered, s.detail = True, "Sem keydown em: " + ", ".join(f["fields_without_keys"]) + \
            " (preenchimento programático, colar ou autofill)."

    s = sig("dwell", "Tecla pressionada por tempo sobre-humano", BEHAVIOR, MODERATE, 25)
    if f["n_keys"] >= 5 and f["dwell_median_ms"] is not None and f["dwell_median_ms"] < 15:
        s.triggered, s.detail = True, f"dwell mediano {f['dwell_median_ms']} ms (referência típica de digitação humana: ~60–150 ms)."

    s = sig("flight_fast", "Digitação rápida demais", BEHAVIOR, MODERATE, 15)
    if f["n_flights"] >= 5 and f["flight_median_ms"] is not None and f["flight_median_ms"] < 35:
        s.triggered, s.detail = True, f"intervalo mediano entre teclas {f['flight_median_ms']} ms."

    s = sig("flight_regular", "Ritmo de digitação regular demais", BEHAVIOR, MODERATE, 15)
    if f["n_flights"] >= 10 and f["flight_cv"] is not None and f["flight_cv"] < 0.25:
        s.triggered, s.detail = True, f"coeficiente de variação {f['flight_cv']} (limiar 0,25; calibre com execuções manuais)."

    s = sig("no_mouse", "Cliques sem nenhum movimento de mouse", BEHAVIOR, MODERATE, 25)
    if f["n_clicks"] and f["n_mouse"] == 0:
        s.triggered, s.detail = True, f"{f['n_clicks']} cliques, 0 mousemove."

    s = sig("mouse_teleport", "Mouse 'teletransportado' até o alvo", BEHAVIOR, MODERATE, 20)
    pre = f["pre_click_moves"]
    if f["n_mouse"] and pre and sum(1 for n in pre if n <= 2) / len(pre) >= 0.5:
        s.triggered, s.detail = True, f"movimentos no 1 s anterior a cada clique: {pre}"

    s = sig("mouse_linear", "Trajetória de mouse em linha reta", BEHAVIOR, MODERATE, 15)
    if f["mouse_straightness_median"] is not None and f["mouse_straightness_median"] > 0.995:
        s.triggered, s.detail = True, f"retidão mediana {f['mouse_straightness_median']} (1.0 = reta perfeita)."

    s = sig("mouse_burst", "Eventos de mouse mais rápidos que o refresh da tela", BEHAVIOR, MODERATE, 15)
    if f["mouse_interval_median_ms"] is not None and f["mouse_interval_median_ms"] < 3:
        s.triggered, s.detail = True, f"intervalo mediano {f['mouse_interval_median_ms']} ms entre mousemove."

    s = sig("click_center", "Cliques exatamente no centro do elemento", BEHAVIOR, MODERATE, 10)
    if f["n_clicks"] >= 2 and f["click_center_dist_median"] is not None and f["click_center_dist_median"] < 0.05:
        s.triggered, s.detail = True, f"distância mediana ao centro {f['click_center_dist_median']} (0 = centro)."

    score = min(100, sum(x.weight for x in S if x.triggered))
    verdict = "humano provável" if score < 25 else "suspeito" if score < 60 else "bot provável"
    return {"score": score, "verdict": verdict, "signals": [asdict(x) for x in S], "features": f}
