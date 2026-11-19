"""Laboratório local de detecção de automação — servidor.

Só biblioteca padrão. Serve a aplicação de cadastro/login, valida os
formulários, grava usuários e cada tentativa (com telemetria) em SQLite e
roda o detector em cada submissão.

    python server.py                 # http://localhost:8000
    python server.py --port 8080 --db data/lab.sqlite3

Escuta apenas em 127.0.0.1 por padrão.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import detector

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
SECRET = secrets.token_bytes(32)  # assina os tokens de formulário; novo a cada execução
MAX_BODY = 512 * 1024

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

PAGES = {
    "/signup": "signup.html",
    "/login": "login.html",
    "/welcome": "welcome.html",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    pw_salt     BLOB NOT NULL,
    pw_hash     BLOB NOT NULL,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY,
    created_at  REAL NOT NULL,
    kind        TEXT NOT NULL,          -- signup | login
    label       TEXT NOT NULL,          -- perfil informado via ?label=
    status      TEXT NOT NULL,          -- ok | invalid | duplicate | auth_failed
    score       INTEGER NOT NULL,
    verdict     TEXT NOT NULL,
    signals     TEXT NOT NULL,          -- JSON: saída do detector
    features    TEXT NOT NULL,          -- JSON: métricas derivadas
    telemetry   TEXT NOT NULL,          -- JSON: dados brutos do coletor
    headers     TEXT NOT NULL           -- JSON: cabeçalhos HTTP (ordem preservada)
);
"""


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)

    def create_user(self, name: str, email: str, password: str) -> bool:
        salt = secrets.token_bytes(16)
        pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        try:
            with self._lock, self._conn:
                self._conn.execute(
                    "INSERT INTO users (name, email, pw_salt, pw_hash, created_at) VALUES (?,?,?,?,?)",
                    (name, email, salt, pw_hash, time.time()),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def check_login(self, email: str, password: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if row is None:
            # mesmo custo de hash para não vazar existência do e-mail por timing
            hashlib.pbkdf2_hmac("sha256", password.encode(), b"\0" * 16, 200_000)
            return None
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), row["pw_salt"], 200_000)
        if not hmac.compare_digest(candidate, row["pw_hash"]):
            return None
        return {"id": row["id"], "name": row["name"], "email": row["email"]}

    def add_run(self, kind, label, status, result, telemetry, headers) -> int:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "INSERT INTO runs (created_at, kind, label, status, score, verdict, signals, features, telemetry, headers)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    time.time(), kind, label, status, result["score"], result["verdict"],
                    json.dumps(result["signals"]), json.dumps(result["features"]),
                    json.dumps(telemetry), json.dumps(headers),
                ),
            )
            return cur.lastrowid

    def runs(self, limit: int = 200) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, created_at, kind, label, status, score, verdict FROM runs ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def run(self, run_id: int) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        out = dict(row)
        for key in ("signals", "features", "telemetry", "headers"):
            out[key] = json.loads(out[key])
        return out


# --- token de formulário: carimbo de tempo assinado pelo servidor ----------------
# O tempo "página carregada → submit" medido aqui não depende do relógio do
# cliente, então não pode ser falsificado editando a telemetria.

def issue_form_token() -> str:
    ts = f"{time.time():.3f}"
    sig = hmac.new(SECRET, ts.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{ts}.{sig}"


def form_token_age(token: str) -> float | None:
    try:
        ts, sig = token.rsplit(".", 1)
    except (AttributeError, ValueError):
        return None
    expected = hmac.new(SECRET, ts.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    return time.time() - float(ts)


# --- validação --------------------------------------------------------------------

def validate_signup(data: dict) -> dict[str, str]:
    errors: dict[str, str] = {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    confirm = str(data.get("confirm", ""))
    if not 2 <= len(name) <= 60:
        errors["name"] = "Nome deve ter entre 2 e 60 caracteres."
    if not EMAIL_RE.match(email) or len(email) > 254:
        errors["email"] = "E-mail inválido."
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        errors["password"] = "Senha precisa de 8+ caracteres, com letra e número."
    if password != confirm:
        errors["confirm"] = "As senhas não conferem."
    if data.get("terms") is not True:
        errors["terms"] = "Aceite os termos para continuar."
    return errors


def validate_login(data: dict) -> dict[str, str]:
    errors: dict[str, str] = {}
    if not EMAIL_RE.match(str(data.get("email", "")).strip()):
        errors["email"] = "E-mail inválido."
    if not data.get("password"):
        errors["password"] = "Informe a senha."
    return errors


# --- HTTP -------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "BotLab/1.0"
    store: Store  # injetado em main()

    def log_message(self, fmt, *args):  # log resumido
        print(f"[{self.log_date_time_string()}] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

    # utilitários
    def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        # pedir client hints de alta entropia para os próximos requests
        self.send_header("Accept-CH", "Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload):
        self._send(status, json.dumps(payload).encode(), "application/json; charset=utf-8")

    def _headers_list(self) -> list[list[str]]:
        # lista em ordem de chegada; a ordem dos cabeçalhos também é um sinal
        return [[k, v] for k, v in self.headers.items() if k.lower() != "cookie"]

    def _read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            data = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def _static(self, rel: str):
        path = (STATIC / rel).resolve()
        if STATIC not in path.parents or not path.is_file():
            return self._send(404, "não encontrado".encode(), "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, path.read_bytes(), ctype)

    # rotas
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            return self._send(302, b"", "text/plain", {"Location": "/signup"})
        if url.path in PAGES:
            return self._static(PAGES[url.path])
        if url.path.startswith("/static/"):
            return self._static(url.path[len("/static/"):])
        if url.path == "/api/form-token":
            return self._json(200, {"token": issue_form_token()})
        if url.path == "/api/runs":
            limit = int(parse_qs(url.query).get("limit", ["200"])[0])
            return self._json(200, self.store.runs(min(limit, 5000)))
        m = re.fullmatch(r"/api/runs/(\d+)", url.path)
        if m:
            run = self.store.run(int(m.group(1)))
            return self._json(200, run) if run else self._json(404, {"erro": "não encontrado"})
        self._send(404, "não encontrado".encode(), "text/plain; charset=utf-8")

    def do_POST(self):
        url = urlparse(self.path)
        if url.path not in ("/api/signup", "/api/login"):
            return self._json(404, {"erro": "não encontrado"})
        data = self._read_json()
        if data is None:
            return self._json(400, {"errors": {"_": "JSON inválido."}})

        kind = "signup" if url.path == "/api/signup" else "login"
        telemetry = data.get("telemetry") if isinstance(data.get("telemetry"), dict) else {}
        label = re.sub(r"[^\w.\-]", "", str(telemetry.get("label") or "manual"))[:40] or "manual"
        headers = self._headers_list()
        server_ctx = {
            "form_age_s": form_token_age(data.get("form_token", "")),
            "honeypot": str(data.get("website", "")),
        }
        result = detector.analyze(telemetry, headers, server_ctx)

        if kind == "signup":
            errors = validate_signup(data)
            if errors:
                status, code, body = "invalid", 400, {"errors": errors}
            elif not self.store.create_user(str(data["name"]).strip(), str(data["email"]).strip().lower(),
                                            str(data["password"])):
                status, code, body = "duplicate", 409, {"errors": {"email": "E-mail já cadastrado."}}
            else:
                status, code, body = "ok", 201, {}
        else:
            errors = validate_login(data)
            if errors:
                status, code, body = "invalid", 400, {"errors": errors}
            elif self.store.check_login(str(data["email"]).strip().lower(), str(data["password"])) is None:
                status, code, body = "auth_failed", 401, {"errors": {"_": "E-mail ou senha incorretos."}}
            else:
                status, code, body = "ok", 200, {}

        run_id = self.store.add_run(kind, label, status, result, telemetry, headers)
        body.update({"run_id": run_id, "score": result["score"], "verdict": result["verdict"]})
        self._json(code, body)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--db", type=Path, default=ROOT / "data" / "lab.sqlite3")
    args = ap.parse_args()

    Handler.store = Store(args.db)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Bot lab em http://{'localhost' if args.host == '127.0.0.1' else args.host}:{args.port}/signup  (db: {args.db})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
