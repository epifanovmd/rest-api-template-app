ARG NODE_VERSION=23-alpine

# Stage 1: install all dependencies (dev + prod) for build
FROM node:${NODE_VERSION} AS installer

WORKDIR /app

COPY package*.json yarn.lock ./
COPY ./patches ./patches

RUN yarn install --frozen-lockfile

# Stage 2: build
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY . .

RUN yarn build

# Stage 3: production runtime
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

COPY package*.json yarn.lock ./
COPY ./patches ./patches

RUN apk update && \
    apk add --no-cache curl

USER root

# Копируем production-зависимости
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/build ./build

# Определяем команду запуска контейнера
CMD ["yarn", "server"]
