# syntax=docker/dockerfile:1.7
# Агент в контейнере — та же папка агента, что у разработчика и на узлах: программа агента,
# agent.yaml + agent.prod.yaml + agent.docker.yaml (поверх друг друга) и воркеры из agent/workers.
# netprobe (from: agent) агент скачивает из своего релиза сам при первом запуске — в том данных.
#
#   docker build -f agent/docker/Dockerfile -t agent .
#   docker run --rm -e AGENT_SERVER_URL=http://api:8181 \
#     -e AGENT_ENROLL_TOKEN=<токен регистрации> -v agent-data:/var/lib/agent agent
#
# Программа агента — с GitHub Release агента версии AGENT_VERSION (`--build-arg AGENT_VERSION=…`,
# по умолчанию — как agent-sdk в package.json); контрольная сумма сверяется с manifest.json.
# Обновление — новым образом (update.mode: external); ключ агента — в томе /var/lib/agent.
ARG PYTHON_VERSION=3.12-slim

# ── Программа агента под платформу образа ────────────────────────────────────
FROM python:${PYTHON_VERSION} AS agent-bin
ARG AGENT_VERSION
ARG TARGETARCH
COPY package.json /tmp/package.json
RUN python - <<'PY'
import hashlib, json, os, re, urllib.request

version = os.environ.get("AGENT_VERSION") or re.search(
    r"agent-sdk-([^/]+)\.tgz", json.load(open("/tmp/package.json"))["dependencies"]["agent-sdk"]).group(1)
arch = os.environ["TARGETARCH"]
base = f"https://github.com/epifanovmd/agent/releases/download/v{version}"
manifest = json.load(urllib.request.urlopen(f"{base}/manifest.json"))
build = next(a for a in manifest["artifacts"] if a["os"] == "linux" and a["arch"] == arch)
os.makedirs("/out", exist_ok=True)
urllib.request.urlretrieve(f"{base}/{build['file']}", "/out/agent")
if hashlib.sha256(open("/out/agent", "rb").read()).hexdigest() != build["sha256"].lower():
    raise SystemExit(f"{build['file']}: sha256 не совпадает с manifest.json")
os.chmod("/out/agent", 0o755)
PY

# ── Runtime: Python (воркеры на стандартной библиотеке) + папка агента ───────
FROM python:${PYTHON_VERSION}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app/agent
COPY agent/agent.yaml agent/agent.prod.yaml agent/agent.docker.yaml ./
COPY agent/workers ./workers
COPY --from=agent-bin /out/agent ./agent

RUN useradd --system --uid 10001 --home-dir /app agent && \
    mkdir -p /var/lib/agent && chown agent /var/lib/agent
USER agent
VOLUME ["/var/lib/agent"]

# Жив ли агент с этим dataDir (отмечается раз в 5 с).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["./agent", "status", "--env", "docker"]

# SIGTERM: агент останавливает воркеры (в контейнере — всегда вместе с собой).
STOPSIGNAL SIGTERM
ENTRYPOINT ["./agent"]
CMD ["run", "--env", "docker"]
