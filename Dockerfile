# syntax=docker/dockerfile:1.7
# Один код — две цели сборки (роль процесса задаёт APP_ROLE):
#   --target api     — HTTP и сокеты, без ffmpeg (медиа обрабатывает воркер);
#   --target worker  — задачи и cron, с ffmpeg; годится для любой роли.
# Без --target собирается worker (последняя стадия).
ARG NODE_VERSION=24-alpine

# ── Все зависимости для сборки ───────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# SDK агентов (agent-sdk) — архив с GitHub Release агента (ссылка в package.json).
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000

# ── Генерация tsoa + tsc → build/ ────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# ── Сборки воркеров проекта (раздаёт API: AGENT_RELEASES_DIR) ─────────────────
# agent/release.sh: архивы agent/workers и manifest.json утилитой agent-release
# (`go run` модуля github.com/epifanovmd/agent той же версии, что agent-sdk) — Go
# нужен только ей. Агента и netprobe в образе нет: API берёт их из релизов GitHub
# (AGENT_RELEASES_*). Подпись воркеров ключом проекта — секрет сборки
# agent_signing_key (необязательно; без него воркеры без подписи) вместе с
# открытым ключом пары в AGENT_UPDATE_PUBLIC_KEY (build-arg): секрет не входит в
# ключ кеша сборки, а ключ пары входит — с другим ключом сборки собираются заново.
FROM golang:1.26-alpine AS agent-release
ARG AGENT_UPDATE_PUBLIC_KEY=
RUN apk add --no-cache bash tar
WORKDIR /src
COPY package.json ./
COPY agent/release.sh agent/
COPY agent/workers/ agent/workers/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=secret,id=agent_signing_key,required=false \
    echo "Ключ проекта: ${AGENT_UPDATE_PUBLIC_KEY:-нет}" && \
    if [ -s /run/secrets/agent_signing_key ]; then \
      AGENT_SIGNING_KEY="$(cat /run/secrets/agent_signing_key)"; export AGENT_SIGNING_KEY; \
    fi && \
    CGO_ENABLED=0 AGENT_RELEASE_OUT=/agent-release bash agent/release.sh

# ── Только production-зависимости, без install-скриптов ──────────────────────
# Кэш yarn — в cache-mount BuildKit, в слой не попадает: чистить не нужно.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --production --ignore-scripts --network-timeout 600000

# ── Runtime API: без ffmpeg ──────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS api
WORKDIR /app

ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    APP_VERSION=${APP_VERSION} \
    AGENT_RELEASES_DIR=agent-release

# tini — корректный PID 1: сигналы доходят до node, дочерние процессы убираются.
# Менеджеры пакетов в рантайме не нужны (старт и миграции — через node): меньше
# образ и CVE — зависимости встроенного npm сканер находит в образе.
RUN apk add --no-cache tini && \
    rm -rf /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
      /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/lib/node_modules/corepack /usr/local/bin/corepack && \
    mkdir -p /app/files && \
    chown -R node:node /app

COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
# Ассеты рантайма (шаблоны писем) лежат вне build/ и читаются по пути от корня.
COPY --chown=node:node templates ./templates
COPY --from=agent-release --chown=node:node /agent-release ./agent-release

USER node
EXPOSE 8181
VOLUME ["/app/files"]

# Liveness: процесс жив. Readiness (/ready) проверяет оркестратор.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SERVER_PORT||8181)+'/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "build/main.js"]

# ── Runtime воркера: + ffmpeg для обработки медиа ────────────────────────────
FROM api AS worker
USER root
RUN apk add --no-cache ffmpeg
USER node
