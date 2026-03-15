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

ARG WG_CONFIG_DIR=/etc/wireguard

RUN apk update && \
    apk add --no-cache iptables iproute2 wireguard-tools && \
    mkdir -p ${WG_CONFIG_DIR} && \
    chmod 700 ${WG_CONFIG_DIR}

USER root

# Копируем production-зависимости
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/build ./build

# Экспонируем порты
EXPOSE 3232
EXPOSE 8181
EXPOSE 51820/udp

# Определяем команду запуска контейнера
CMD ["yarn", "server"]
