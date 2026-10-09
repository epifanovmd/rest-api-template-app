# syntax=docker/dockerfile:1.7
# Агент в контейнере: агент (github.com/epifanovmd/agent, PID 1 — связь, очередь
# важных сообщений, запуск воркеров), Python для воркеров без SDK и воркеры: echo
# (воркер проекта, agent/workers/echo) и netprobe (проверка сети, из сборок агента);
# настройки — agent/docker/agent.yaml. Свой воркер — каталогом в
# agent/workers и строкой в agent/docker/agent.yaml (или образом `FROM` этого).
#
#   docker build -f agent/docker/Dockerfile -t agent .
#   docker run --rm -e AGENT_SERVER_URL=http://api:8181 \
#     -e AGENT_ENROLL_TOKEN=<токен регистрации> -v agent-data:/var/lib/agent agent
#
# Программа агента и netprobe — с GitHub Release агента версии AGENT_VERSION
# (`--build-arg AGENT_VERSION=…`); контрольные суммы сверяются с manifest.json сборок. Обновление — новым образом (update.mode=external); ключ
# агента — в томе /var/lib/agent (без тома агент регистрируется заново при каждом
# старте).
ARG PYTHON_VERSION=3.12-slim
ARG AGENT_VERSION=1.1.0

# ── Программа агента под платформу образа ────────────────────────────────────
FROM python:${PYTHON_VERSION} AS agent-bin
ARG AGENT_VERSION
ARG TARGETARCH
RUN python - <<'PY'
import hashlib, json, os, urllib.request

version, arch = os.environ["AGENT_VERSION"], os.environ["TARGETARCH"]
base = f"https://github.com/epifanovmd/agent/releases/download/v{version}"
os.makedirs("/out", exist_ok=True)

def fetch(build: dict, target: str) -> None:
    urllib.request.urlretrieve(f"{base}/{build['file']}", target)
    digest = hashlib.sha256(open(target, "rb").read()).hexdigest()
    if digest != build["sha256"]:
        raise SystemExit(f"{build['file']}: sha256 {digest} не совпадает с manifest.json")
    os.chmod(target, 0o755)

urllib.request.urlretrieve(f"{base}/manifest.json", "/out/manifest.json")
manifest = json.load(open("/out/manifest.json"))
if manifest["version"] != version:
    raise SystemExit(f"версия {manifest['version']}, ожидалась {version}")
mine = lambda b: b["os"] == "linux" and b["arch"] == arch
fetch(next(a for a in manifest["artifacts"] if mine(a)), "/out/agent")
fetch(next(w for w in manifest["workers"] if w["name"] == "netprobe" and mine(w)), "/out/netprobe")
PY

# ── Runtime: Python (воркеры на стандартной библиотеке) + агент ─────────────
FROM python:${PYTHON_VERSION}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    AGENT_CONFIG=/etc/agent/agent.yaml \
    AGENT_DATA_DIR=/var/lib/agent \
    AGENT_UPDATE_MODE=external

WORKDIR /app

COPY agent/workers ./workers
COPY agent/docker/agent.yaml /etc/agent/agent.yaml
COPY --from=agent-bin /out/ /tmp/agent-bin/
RUN install -m 0755 /tmp/agent-bin/agent /usr/local/bin/agent && \
    install -m 0755 /tmp/agent-bin/netprobe /usr/local/bin/netprobe && \
    rm -rf /tmp/agent-bin

RUN useradd --system --uid 10001 --home-dir /app agent && \
    mkdir -p /var/lib/agent && chown agent /var/lib/agent
USER agent
VOLUME ["/var/lib/agent"]

# Жив ли агент с этим dataDir (отмечается раз в 15 с).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["agent", "status"]

# SIGTERM: агент останавливает воркеры (в контейнере — всегда вместе с собой):
# SIGTERM, через stopTimeout — SIGKILL; stop_grace_period оркестратора — не меньше.
STOPSIGNAL SIGTERM
ENTRYPOINT ["agent"]
CMD ["run"]
