---
id: domain/modules
title: Модули
summary: Все модули src/modules с назначением одной строкой, порядок регистрации в app.module.ts, ссылки на README.
layer: project
roles: [all]
stages: [intake, analysis, planning]
depends_on: [domain/overview]
---

# Модули

Устройство, эндпоинты, события, ошибки и gotcha модуля — в его README. Здесь —
только карта.

## Инфраструктура

| Модуль                                                  | Назначение                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| core (`src/core`)                                       | ядро: DI-модули, auth-ядро, ошибки, EventBus, контракты задач и хранилища, guards |
| [observability](../../src/core/observability/README.md) | логи, метрики Prometheus, Sentry, health-индикаторы                               |
| [storage](../../src/modules/storage/README.md)          | `FileStorage`: драйверы S3 и диск, подписанные ссылки, маршрут `/files/*`         |
| [jobs](../../src/modules/jobs/README.md)                | очередь pg-boss: `JobQueue`, выполнение, cron, health-индикатор `jobs`            |
| [mailer](../../src/modules/mailer/README.md)            | письма по шаблонам и локалям через задачу `mail.send`                             |
| [socket](../../src/modules/socket/README.md)            | Socket.IO: аутентификация, комнаты и политики, presence, рассылка событий         |

## Вспомогательные

| Модуль                                                                     | Назначение                                  |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| [otp](../../src/modules/otp/README.md)                                     | коды подтверждения email: попытки, cooldown |
| [reset-password-tokens](../../src/modules/reset-password-tokens/README.md) | токены сброса пароля                        |
| [permission](../../src/modules/permission/README.md)                       | реестр и каталог прав (`definePermissions`) |
| [role](../../src/modules/role/README.md)                                   | роли, их права, засев прав по умолчанию     |

У `permission` и `role` нет своего `@Module`: их сущности, репозитории и сервисы
регистрирует модуль `user`.

## Пользователи и доступ

| Модуль                                             | Назначение                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| [user](../../src/modules/user/README.md)           | пользователи, email и пароль, администрирование, admin и dev-сид   |
| [profile](../../src/modules/profile/README.md)     | профиль, приватность, presence, связи профиля (`CONTACT_RELATION`) |
| [file](../../src/modules/file/README.md)           | файлы: загрузка, обработка медиа, права «все / свои», GC           |
| [auth](../../src/modules/auth/README.md)           | вход, регистрация, 2FA, сброс пароля, блокировка, refresh-cookie   |
| [session](../../src/modules/session/README.md)     | сессии устройств, ротация refresh, завершение и отзыв              |
| [api-key](../../src/modules/api-key/README.md)     | API-ключи сервисов и схема аутентификации `apiKey`                 |
| [audit](../../src/modules/audit/README.md)         | журнал событий безопасности, живая лента                           |
| [biometric](../../src/modules/biometric/README.md) | вход по подписи устройства (nonce)                                 |
| [passkeys](../../src/modules/passkeys/README.md)   | WebAuthn: регистрация и вход по passkey                            |

## Регистрация (`src/app.module.ts`)

Порядок: Core → Observability → Storage → Jobs → Mailer, Otp, ResetPasswordTokens →
User, Profile, File, Auth, Session, ApiKey, Audit, Biometric, Passkeys → модули
проекта → **SocketModule последним** (собирает все handlers и listeners).

Новый модуль — `yarn gen:module <name>` ([ops/codegen](../70-ops/codegen.md)),
регистрация до `SocketModule`; куда класть код —
[architecture/placement](../20-architecture/placement.md), зависимости между модулями —
[architecture/dependencies](../20-architecture/dependencies.md).

## Фоновые задачи

| Очередь                      | Модуль   | Тип                                    |
| ---------------------------- | -------- | -------------------------------------- |
| `mail.send`                  | mailer   | служебная, повторы                     |
| `file.process`               | file     | обработка медиа, ставится в транзакции |
| `file.remove`                | file     | удаление объектов, повторы             |
| `file.cleanup-pending`       | file     | cron `0 * * * *`                       |
| `file.gc`                    | file     | cron `15 4 * * *`                      |
| `session.cleanup`            | session  | cron `0 * * * *`                       |
| `otp.cleanup`                | otp      | cron `*/30 * * * *`                    |
| `passkeys.challenge-cleanup` | passkeys | cron `*/15 * * * *`                    |
| `audit.cleanup`              | audit    | cron `30 3 * * *`                      |
