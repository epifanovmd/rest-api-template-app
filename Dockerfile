ARG NODE_VERSION=23-alpine

# Stage 1: install all dependencies (dev + prod) for build
FROM node:${NODE_VERSION} AS installer

WORKDIR /app

COPY package*.json yarn.lock ./
COPY ./patches ./patches

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && yarn install --frozen-lockfile --cache-folder /tmp/yarn-cache \
    && apk del .build-deps \
    && rm -rf /tmp/yarn-cache

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

RUN apk add --no-cache su-exec \
    && apk add --no-cache --virtual .build-deps python3 make g++ \
    && yarn install --production --frozen-lockfile --cache-folder /tmp/yarn-cache \
    && apk del .build-deps \
    && rm -rf /tmp/yarn-cache

COPY --from=builder /app/build ./build

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

EXPOSE 3232 8181

# entrypoint гарантирует права на files/ после монтирования volume
ENTRYPOINT ["sh", "-c", "mkdir -p /app/files && chown appuser:appgroup /app/files && exec su-exec appuser node build/main.js"]
