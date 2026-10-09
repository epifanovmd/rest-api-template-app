# syntax=docker/dockerfile:1.7
# Агент в контейнере: агент (github.com/epifanovmd/agent, PID 1 — связь, очередь
# важных сообщений, запуск воркеров), Python для воркеров без SDK и воркеры: echo
# (воркер проекта, agent/workers/echo) и netprobe (проверка сети, сборка из выпуска
# agent/release); настройки — agent/docker/agent.yaml. Свой воркер — каталогом в
# agent/workers и строкой в agent/docker/agent.yaml (или образом `FROM` этого).
#
#   docker build -f agent/docker/Dockerfile -t agent .
#   docker run --rm -e AGENT_SERVER_URL=http://api:8181 \
#     -e AGENT_ENROLL_TOKEN=<токен регистрации> -v agent-data:/var/lib/agent agent
#
# Программа агента и netprobe — из каталога выпуска agent/release (yarn agent:release:
# агент с GitHub Release, netprobe — из исходников агента), иначе программа агента — с
# GitHub Release версии AGENT_VERSION, а образ — без netprobe; контрольная сумма
# сверяется с manifest.json выпуска. Обновление — новым образом (update.mode=external); ключ
# агента — в томе /var/lib/agent (без тома агент регистрируется заново при каждом
# старте).
ARG PYTHON_VERSION=3.12-slim
ARG AGENT_VERSION=1.0.0

# ── Программа агента под платформу образа ────────────────────────────────────
FROM python:${PYTHON_VERSION} AS agent-bin
ARG AGENT_VERSION
ARG TARGETARCH
COPY agent/ /src/agent/
RUN python - <<'PY'
import hashlib, json, os, shutil, urllib.request

version, arch = os.environ["AGENT_VERSION"], os.environ["TARGETARCH"]
local = "/src/agent/release"
remote = f"https://github.com/epifanovmd/agent/releases/download/v{version}"
name = f"agent-linux-{arch}"
os.makedirs("/out", exist_ok=True)

def fetch(file: str, target: str) -> None:
    if os.path.exists(f"{local}/manifest.json"):
        shutil.copy(f"{local}/{file}", target)
    else:
        urllib.request.urlretrieve(f"{remote}/{file}", target)

fetch("manifest.json", "/out/manifest.json")
manifest = json.load(open("/out/manifest.json"))
if manifest["version"] != version:
    raise SystemExit(f"выпуск {manifest['version']}, ожидался {version}")
artifact = next(a for a in manifest["artifacts"] if a["os"] == "linux" and a["arch"] == arch)
fetch(name, "/out/agent")
digest = hashlib.sha256(open("/out/agent", "rb").read()).hexdigest()
if digest != artifact["sha256"]:
    raise SystemExit(f"{name}: sha256 {digest} не совпадает с manifest.json")
os.chmod("/out/agent", 0o755)

# Воркер проверки сети netprobe — из того же выпуска; нет сборки — образ без него
# (в выпуске агента на GitHub его нет: его собирает agent/release.sh).
probe = next((w for w in manifest.get("workers", []) if w["name"] == "netprobe"
              and w["os"] == "linux" and w["arch"] == arch), None)
if probe:
    fetch(probe["file"], "/out/netprobe")
    digest = hashlib.sha256(open("/out/netprobe", "rb").read()).hexdigest()
    if digest != probe["sha256"]:
        raise SystemExit(f"{probe['file']}: sha256 {digest} не совпадает с manifest.json")
    os.chmod("/out/netprobe", 0o755)
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
    if [ -f /tmp/agent-bin/netprobe ]; then \
      install -m 0755 /tmp/agent-bin/netprobe /usr/local/bin/netprobe; \
    else \
      sed -i '/# netprobe:begin/,/# netprobe:end/d' /etc/agent/agent.yaml; \
    fi && \
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
