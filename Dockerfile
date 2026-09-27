# syntax=docker/dockerfile:1.7
# Один код — две цели сборки (роль процесса задаёт APP_ROLE):
#   --target api     — HTTP и сокеты, без ffmpeg (медиа обрабатывает воркер);
#   --target worker  — задачи и cron, с ffmpeg; годится для любой роли.
# Без --target собирается worker (последняя стадия).
ARG NODE_VERSION=24-alpine

# ── Все зависимости для сборки ───────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000

# ── Генерация tsoa + tsc → build/ ────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

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
    APP_VERSION=${APP_VERSION}

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
