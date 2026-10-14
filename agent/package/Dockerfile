# syntax=docker/dockerfile:1.7
# Агент из этого архива в контейнере: программа агента, настройки и воркеры — отсюда же
# (архив под платформу машины: linux-amd64 или linux-arm64). Обычно — через compose.yml:
#
#   cp .env.example .env    # адрес, токен, имя
#   docker compose up -d --build
#
# Без compose: docker build -t agent-rest . && docker run -d --env-file .env \
#   -v agent-data:/var/lib/agent --restart unless-stopped agent-rest
# Обновление — новым архивом и пересборкой (update.mode: external); ключ агента — в томе.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app/agent
COPY . .
RUN useradd --system --uid 10001 --home-dir /app agent && \
    mkdir -p /var/lib/agent && chown agent /var/lib/agent
USER agent
VOLUME ["/var/lib/agent"]

# Жив ли агент с этим dataDir.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["./agent", "status", "--env", "docker"]

# SIGTERM: агент останавливает воркеры (в контейнере — всегда вместе с собой).
STOPSIGNAL SIGTERM
ENTRYPOINT ["./agent"]
CMD ["run", "--env", "docker"]
