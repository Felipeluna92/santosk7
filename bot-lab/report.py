"""Relatório comparativo das execuções gravadas pelo servidor.

    python report.py                         # lê data/lab.sqlite3, escreve data/report.md
    python report.py --db outro.sqlite3 --out relatorio.md --kind signup

Agrupa por label (perfil do driver, ou "manual" para execuções suas no
navegador) e compara pontuação, métricas comportamentais e quais sinais
dispararam em cada perfil.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREFERRED_ORDER = ["manual", "js-spam", "naive", "ua-spoof", "inconsistent", "paced", "humanized", "humanized-headed"]

METRICS = [
    ("form_age_s", "tempo até submit (s)"),
    ("dwell_median_ms", "dwell mediano (ms)"),
    ("flight_median_ms", "flight mediano (ms)"),
    ("flight_cv", "CV do flight"),
    ("n_mouse", "mousemoves"),
    ("mouse_straightness_median", "retidão do mouse"),
    ("click_center_dist_median", "dist. clique↔centro"),
]


def load(db: Path, kind: str | None) -> list[dict]:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    q = "SELECT id, kind, label, status, score, verdict, signals, features, telemetry FROM runs"
    args: tuple = ()
    if kind:
        q += " WHERE kind = ?"
        args = (kind,)
    rows = []
    for r in conn.execute(q, args):
        d = dict(r)
        d["signals"] = json.loads(d["signals"])
        d["features"] = json.loads(d["features"])
        d["raw"] = sum(s["weight"] for s in d["signals"] if s["triggered"])
        d["fp"] = fingerprint(json.loads(d.pop("telemetry")).get("env") or {})
        rows.append(d)
    return rows


def fingerprint(env: dict) -> dict | None:
    """Componentes estáveis do ambiente; iguais em sessões diferentes = mesma máquina/config."""
    if not env:
        return None
    sc = env.get("screen") or {}
    return {
        "canvas": env.get("canvasHash"),
        "webgl": (env.get("webgl") or {}).get("renderer"),
        "ua": env.get("userAgent"),
        "tela": f"{sc.get('width')}x{sc.get('height')}@{sc.get('dpr')}",
        "fuso": env.get("timezone"),
        "cpu": env.get("hardwareConcurrency"),
    }


def fmt(x, nd=1):
    if x is None:
        return "–"
    if isinstance(x, float):
        return f"{x:.{nd}f}".rstrip("0").rstrip(".") if nd else f"{x:.0f}"
    return str(x)


def med(vals):
    vals = [v for v in vals if isinstance(v, (int, float))]
    return st.median(vals) if vals else None


def order_labels(labels):
    known = [l for l in PREFERRED_ORDER if l in labels]
    return known + sorted(l for l in labels if l not in PREFERRED_ORDER)


def build(rows: list[dict], kind: str | None) -> str:
    by_label = defaultdict(list)
    for r in rows:
        by_label[r["label"]].append(r)
    labels = order_labels(by_label)

    out = [
        "# Relatório do laboratório de detecção",
        "",
        f"Gerado em {dt.datetime.now():%Y-%m-%d %H:%M} · {len(rows)} submissões"
        + (f" · tipo: {kind}" if kind else " · cadastro + login"),
        "",
        "`pontuação` é limitada a 100; `bruta` é a soma de todos os pesos disparados, "
        "útil para comparar perfis que estouram o teto.",
        "",
        "## Resumo por perfil",
        "",
        "| perfil | n | pontuação (média) | faixa | bruta (média) | vereditos |",
        "|---|---:|---:|---|---:|---|",
    ]
    for l in labels:
        rs = by_label[l]
        scores = [r["score"] for r in rs]
        verdicts = Counter(r["verdict"] for r in rs)
        out.append(
            f"| {l} | {len(rs)} | {st.fmean(scores):.1f} | {min(scores)}–{max(scores)} | "
            f"{st.fmean(r['raw'] for r in rs):.0f} | "
            + ", ".join(f"{v} ×{c}" for v, c in verdicts.most_common())
            + " |"
        )

    out += ["", "## Métricas comportamentais (medianas)", "",
            "| perfil | " + " | ".join(m[1] for m in METRICS) + " |",
            "|---|" + "---:|" * len(METRICS)]
    for l in labels:
        rs = by_label[l]
        nd = {"flight_cv": 3, "mouse_straightness_median": 4, "click_center_dist_median": 3}
        cells = [fmt(med(r["features"].get(k) for r in rs), nd.get(k, 1)) for k, _ in METRICS]
        out.append(f"| {l} | " + " | ".join(cells) + " |")

    # diversidade de fingerprint: sinal entre sessões, invisível para uma sessão isolada
    out += ["", "## Diversidade de fingerprint entre sessões", "",
            "Valores distintos por componente dentro de cada perfil. Usuários reais divergem; "
            "várias contas com o fingerprint inteiro idêntico apontam para a mesma origem.", "",
            "| perfil | sessões | canvas | webgl | ua | tela | fuso | cpu | fingerprint completo |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for l in labels:
        fps = [r["fp"] for r in by_label[l] if r["fp"]]
        if not fps:
            continue
        cols = [len({fp[k] for fp in fps}) for k in ("canvas", "webgl", "ua", "tela", "fuso", "cpu")]
        full = len({json.dumps(fp, sort_keys=True) for fp in fps})
        out.append(f"| {l} | {len(fps)} | " + " | ".join(map(str, cols)) + f" | {full} |")
    all_fps = Counter(json.dumps(r["fp"], sort_keys=True) for r in rows if r["fp"])
    biggest = all_fps.most_common(1)
    if biggest:
        out.append("")
        out.append(f"Maior grupo com fingerprint completo idêntico na base inteira: **{biggest[0][1]} sessões** "
                   f"de {sum(all_fps.values())}.")

    # matriz sinal × perfil
    sig_meta = {}
    for r in rows:
        for s in r["signals"]:
            sig_meta.setdefault(s["id"], s)
    out += ["", "## Sinais × perfis (% das submissões em que o sinal disparou)", "",
            "| sinal | categoria | robustez | peso | " + " | ".join(labels) + " |",
            "|---|---|---|---:|" + "---:|" * len(labels)]
    hit_rates = {}
    for sid, meta in sig_meta.items():
        rates = []
        for l in labels:
            rs = by_label[l]
            n = sum(1 for r in rs for s in r["signals"] if s["id"] == sid and s["triggered"])
            rates.append(n / len(rs))
        hit_rates[sid] = rates
        weight = "variável" if sid == "form_timing" else meta["weight"]
        out.append(
            f"| {meta['title']} | {meta['category']} | {meta['robustness']} | {weight} | "
            + " | ".join(f"{p:.0%}" if p else "·" for p in rates)
            + " |"
        )

    never = [sig_meta[s]["title"] for s, r in hit_rates.items() if not any(r)]
    always = [sig_meta[s]["title"] for s, r in hit_rates.items() if r and all(x == 1 for x in r)]
    out += ["", "## Leitura automática", ""]
    if never:
        out.append("- **Nunca dispararam** (sem poder de discriminação nesta amostra, ou já neutralizados): "
                   + "; ".join(never) + ".")
    if always:
        out.append("- **Dispararam em 100% de todos os perfis** (separam ambiente de laboratório, não perfil): "
                   + "; ".join(always) + ".")
    for l in labels:
        rs = by_label[l]
        top = Counter(s["title"] for r in rs for s in r["signals"] if s["triggered"])
        if top:
            items = ", ".join(t for t, _ in top.most_common())
            out.append(f"- **{l}** foi pego por: {items}.")
        else:
            out.append(f"- **{l}**: nenhum sinal disparou.")
    if "manual" not in by_label:
        out += ["", "> Sem execuções `manual` nesta base. Abra `http://localhost:8000/signup` no seu "
                "navegador e cadastre-se algumas vezes para ter a linha de base humana e calibrar os limiares."]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=ROOT / "data" / "lab.sqlite3")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "report.md")
    ap.add_argument("--kind", choices=["signup", "login"])
    args = ap.parse_args()
    rows = load(args.db, args.kind)
    if not rows:
        raise SystemExit("Nenhuma execução na base. Rode o servidor e o driver primeiro.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build(rows, args.kind), encoding="utf-8")
    print(f"Relatório: {args.out}")


if __name__ == "__main__":
    main()
