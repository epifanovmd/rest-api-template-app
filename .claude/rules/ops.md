---
paths:
  - "docker-compose*.yml"
  - "Dockerfile"
  - "Makefile"
  - ".github/**"
  - "package.json"
  - "tsoa.json"
  - "tsconfig*.json"
  - ".env*.example"
  - "src/config.ts"
  - ".nvmrc"
  - ".dockerignore"
  - ".deployignore"
  - ".prettierrc.json"
---

# Инфраструктура и конфигурация

- Окружение, сервисы, e2e, CI/деплой — `docs/70-ops/`
  ([commands](../../docs/70-ops/commands.md), [environment](../../docs/70-ops/environment.md),
  [services-compose](../../docs/70-ops/services-compose.md), [ci-deploy](../../docs/70-ops/ci-deploy.md)).
- Параметр окружения — через конфиг модуля, `process.env` — только в `config.ts` и
  `<feature>.config.ts`
  ([config](../../docs/20-architecture/config.md)).
- Изменение инфраструктуры — с `yarn test:e2e`; деплой и действия на хостах — только по
  команде пользователя.
