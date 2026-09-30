"""
Executor mínimo do Hermes Agent (Nous Research) para o apps/api — só biblioteca
padrão, corre dentro da imagem oficial `nousresearch/hermes-agent`.

POST /run  (Authorization: Bearer $RUNNER_TOKEN)
  {"prompt": str, "model": str, "provider": str|null, "config_yaml": str,
   "env": {"OPENAI_API_KEY": ..., ...}, "timeout_sec": int}
→ {"exit_code", "stdout", "stderr_tail", "usage", "seconds"}

Porquê um contentor à parte, e não o Hermes dentro da API: o Hermes lê páginas
web arbitrárias (risco de instruções escondidas nelas) e, em `-z`, "approvals
are auto-bypassed". Aqui ele não tem a chave da base de dados, nem porta
pública, nem outras ferramentas que não as de pesquisa web (`-t web`). O pior
que uma página maliciosa consegue é devolver notícias falsas — e essas passam
depois pela validação do apps/api e por toda a cadeia editorial.

Cada execução usa um HERMES_HOME novo e descartável (sem memória nem skills
de execuções anteriores) e recebe a chave da IA só no ambiente do processo —
nunca é escrita em disco.
"""

from __future__ import annotations

import hmac
import json
import os
import shutil
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RUNNER_TOKEN = os.environ.get("RUNNER_TOKEN", "")
HERMES_BIN = os.environ.get("HERMES_BIN", "hermes")
PORT = int(os.environ.get("RUNNER_PORT", "8700"))
MAX_TIMEOUT_SEC = 1800

# só estas variáveis podem vir do apps/api — nada de PATH, HOME, etc.
ALLOWED_ENV = {
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "TAVILY_API_KEY",
    "EXA_API_KEY",
    "FIRECRAWL_API_KEY",
}


def run_hermes(req: dict) -> dict:
    prompt = str(req.get("prompt") or "")
    model = str(req.get("model") or "")
    if not prompt or not model:
        return {"exit_code": -1, "stdout": "", "stderr_tail": "prompt e model são obrigatórios", "usage": None, "seconds": 0}
    timeout = min(int(req.get("timeout_sec") or 900), MAX_TIMEOUT_SEC)

    home = Path(tempfile.mkdtemp(prefix="hermes-run-"))
    try:
        (home / "config.yaml").write_text(str(req.get("config_yaml") or ""), encoding="utf-8")
        usage_file = home / "usage.json"
        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": str(home),
            "HERMES_HOME": str(home),
            "LANG": "C.UTF-8",
            "PYTHONIOENCODING": "utf-8",
        }
        # só existem em Windows (testes locais) — sem elas o Python não abre sockets
        env.update({k: os.environ[k] for k in ("SYSTEMROOT", "WINDIR") if k in os.environ})
        if os.name == "nt":
            env.update(USERPROFILE=str(home), LOCALAPPDATA=str(home), APPDATA=str(home))
        env.update({k: str(v) for k, v in (req.get("env") or {}).items() if k in ALLOWED_ENV and v})

        # -t web: só pesquisa e leitura de páginas — nunca terminal/ficheiros
        cmd = [HERMES_BIN, "-z", prompt, "-t", "web", "-m", model, "--usage-file", str(usage_file)]
        if req.get("provider"):
            cmd += ["--provider", str(req["provider"])]
        if req.get("reasoning") in {"none", "minimal", "low", "medium", "high", "xhigh", "max"}:
            cmd += ["--reasoning", str(req["reasoning"])]

        started = time.monotonic()
        try:
            # UTF-8 explícito: o Hermes escreve UTF-8, e ler na codificação do sistema
            # estragava os acentos ("Chéquia" → "ChÃ©quia")
            proc = subprocess.run(
                cmd, env=env, cwd=home, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout
            )
            exit_code, stdout, stderr = proc.returncode, proc.stdout, proc.stderr
        except subprocess.TimeoutExpired as err:
            exit_code = 124
            stdout = err.stdout if isinstance(err.stdout, str) else ""
            stderr = f"tempo esgotado ({timeout}s)"
        usage = None
        if usage_file.exists():
            try:
                usage = json.loads(usage_file.read_text(encoding="utf-8"))
            except ValueError:
                usage = None
        return {
            "exit_code": exit_code,
            "stdout": stdout[-200_000:],
            "stderr_tail": (stderr or "")[-4000:],
            "usage": usage,
            "seconds": round(time.monotonic() - started, 1),
        }
    finally:
        shutil.rmtree(home, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/run":
            self._send(404, {"error": "not found"})
            return
        auth = self.headers.get("Authorization", "")
        if not RUNNER_TOKEN or not hmac.compare_digest(auth, f"Bearer {RUNNER_TOKEN}"):
            self._send(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            self._send(413, {"error": "pedido grande demais"})
            return
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send(400, {"error": "JSON inválido"})
            return
        self._send(200, run_hermes(req))

    def log_message(self, fmt: str, *args) -> None:
        # nunca registar corpos (levam chaves) — só a linha do pedido
        print(f"[hermes-runner] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    if not RUNNER_TOKEN:
        raise SystemExit("RUNNER_TOKEN não definido — recuso arrancar sem autenticação")
    print(f"[hermes-runner] a ouvir em :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
