# REST API Template

Шаблон серверного приложения на Node.js + TypeScript: модульный монолит с IoC,
версионированный REST API с генерацией маршрутов и OpenAPI из декораторов, реляционная
БД через ORM, real-time транспорт, очередь фоновых задач, хранилище файлов по
подписанным ссылкам и событийная модель между модулями.

Платформа без предметной области: пользователи и доступ, сессии, 2FA, биометрия и
passkeys, профиль, файлы, фоновые задачи, почта, аудит, API-ключи, реальное время.
Стек — Koa + tsoa, Inversify, TypeORM + PostgreSQL, pg-boss, Redis, Socket.IO,
S3/диск, Zod, pino, Mocha.

## Быстрый старт

Нужны Node.js ≥ 22.13, Yarn 1 и Docker.

```sh
yarn
cp .env.example .env.development
yarn services:up     # Postgres, Redis, Mailpit, S3 — одноразовые, на сдвинутых портах
yarn dev             # API — /api/v1/..., Swagger UI — /api-docs
```

Перед merge — `yarn verify` (генерация маршрутов, lint, типы, тесты,
сборка); при изменении API, схемы БД или инфраструктуры — ещё `yarn test:e2e`.

## Документация

| Что                                          | Где                                             |
| -------------------------------------------- | ----------------------------------------------- |
| индекс всех документов                       | [docs/README.md](docs/README.md)                |
| модули и их README                           | [docs/modules.md](docs/modules.md)              |
| этапы разработки, багфикс, git               | [docs/10-process/](docs/10-process/workflow.md) |
| архитектура и правила кода                   | `docs/20-architecture/`, `docs/30-conventions/` |
| модули, права, события                       | `docs/60-domain/`                               |
| команды, окружение, e2e, CI/деплой           | [docs/70-ops/](docs/70-ops/commands.md)         |
| как устроена документация и как её дополнять | [docs/00-meta/](docs/00-meta/doc-system.md)     |

Инструкции для Claude Code — [CLAUDE.md](CLAUDE.md).

## Лицензия

MIT
