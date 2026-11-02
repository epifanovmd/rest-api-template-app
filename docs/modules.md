<!-- Сгенерировано scripts/docs/index.mjs (yarn docs:index). Не редактировать вручную. -->

# Модули

Документация модулей лежит рядом с кодом: `src/<модуль>/README.md`. Шаблон —
[module-readme](00-meta/templates/module-readme.md).

## common

| Модуль                            | О чём                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [common](../src/common/README.md) | Общие утилиты без DI и домена — нормализация телефона, uuid, OTP, assertNotNull и безопасная работа с zip-архивами. |

## core

| Модуль                                                    | О чём                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [core/auth](../src/core/auth/README.md)                   | Аутентификация и проверка прав без знания домена — JWT, реестр схем `@Security`, отзыв токенов, права по userId, хеши паролей.           |
| [core/bootstrap](../src/core/bootstrap/README.md)         | Контракт инициализаторов процесса — код, который выполняется после загрузки модулей и останавливается при shutdown.                      |
| [core/crypto](../src/core/crypto/README.md)               | Симметричное шифрование секретов, хранимых в БД, ключом приложения (AES-256-GCM).                                                        |
| [core/db](../src/core/db/README.md)                       | Подключение к PostgreSQL — фабрика DataSource, миграции под advisory-lock, фоновая проверка БД, коды ошибок Postgres, LISTEN/NOTIFY.     |
| [core/decorators](../src/core/decorators/README.md)       | Декораторы модульной системы и маршрутов — @Module, @Injectable, @InjectableRepository, Zod-валидация входа, @UseGuards.                 |
| [core/dto](../src/core/dto/README.md)                     | Общие контракты ответов API — тело ошибки, пагинация offset/limit и курсорные ленты, базовый класс DTO.                                  |
| [core/event-bus](../src/core/event-bus/README.md)         | Внутрипроцессная шина доменных событий — единственный способ реакции одного модуля на действия другого.                                  |
| [core/guards](../src/core/guards/README.md)               | Гарды маршрутов для @UseGuards — лимит частоты по IP (Redis или память), HTTPS, белый список IP, статический ключ, подтверждённый email. |
| [core/http](../src/core/http/README.md)                   | HTTP-примитивы ядра — исключения с машинными кодами и defineErrors, тип UUID для путей, servers для Swagger, long-poll.                  |
| [core/jobs](../src/core/jobs/README.md)                   | Контракт очереди фоновых задач — JobQueue как DI-токен, IJobHandler, реестр обработчиков и хук метрик; реализация в модуле jobs.         |
| [core/logger](../src/core/logger/README.md)               | Структурированный логгер pino с requestId из AsyncLocalStorage и маскированием секретов — единственный способ писать логи.               |
| [core/observability](../src/core/observability/README.md) | Наблюдаемость — метрики Prometheus, отправка 5xx и ошибок процесса в Sentry, проверки здоровья зависимостей и модулей.                   |
| [core/redis](../src/core/redis/README.md)                 | Клиенты Redis для состояния, общего между процессами, и LiveStore — живое состояние с TTL с откатом на память процесса.                  |
| [core/repository](../src/core/repository/README.md)       | BaseRepository — базовый класс репозиториев TypeORM с транзакциями и привязкой к EntityManager.                                          |
| [core/routing](../src/core/routing/README.md)             | Точки расширения HTTP вне tsoa — провайдеры маршрутов Koa и сырые обработчики протоколов до разбора тела.                                |
| [core/storage](../src/core/storage/README.md)             | Контракт файлового хранилища по ключам — FileStorage как DI-токен с подписанными ссылками; реализации в модуле storage.                  |

## middleware

| Модуль                                    | О чём                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [middleware](../src/middleware/README.md) | Сквозные Koa-middleware приложения — requestId, лог доступа, единый формат ошибок, helmet, CORS, глобальный лимит запросов, разбор тела. |

## modules

| Модуль                                                                          | О чём                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [modules/api-key](../src/modules/api-key/README.md)                             | API-ключи сервисов для интеграций: выпуск, отзыв и схема аутентификации apiKey со scope                                                  |
| [modules/audit](../src/modules/audit/README.md)                                 | Журнал событий безопасности: запись из доменных событий, лента «Моя активность» и общий журнал, очистка по сроку хранения                |
| [modules/auth](../src/modules/auth/README.md)                                   | Регистрация, вход (пароль, 2FA), блокировка аккаунта, сброс пароля, обновление токенов, выход и refresh-cookie                           |
| [modules/biometric](../src/modules/biometric/README.md)                         | Вход по биометрии устройства: регистрация публичного ключа и проверка подписи одноразового nonce                                         |
| [modules/file](../src/modules/file/README.md)                                   | Файлы пользователей: загрузка с проверкой типа, фоновая обработка медиа, подписанные ссылки, владение и сборка мусора                    |
| [modules/jobs](../src/modules/jobs/README.md)                                   | Очередь фоновых и cron-задач на pg-boss: реализация JobQueue ядра, повторы, постановка в транзакции (outbox)                             |
| [modules/mailer](../src/modules/mailer/README.md)                               | Отправка писем через очередь mail.send: рендер локализованных шаблонов и SMTP с повторами                                                |
| [modules/otp](../src/modules/otp/README.md)                                     | Шестизначные одноразовые коды подтверждения email с лимитом попыток и cooldown повторной отправки                                        |
| [modules/passkeys](../src/modules/passkeys/README.md)                           | Регистрация и вход по WebAuthn/FIDO2 passkeys                                                                                            |
| [modules/permission](../src/modules/permission/README.md)                       | Реестр прав модулей (definePermissions), каталог прав с подписями и справочник прав в БД                                                 |
| [modules/profile](../src/modules/profile/README.md)                             | Профили пользователей, настройки приватности и присутствие online/offline                                                                |
| [modules/reset-password-tokens](../src/modules/reset-password-tokens/README.md) | Одноразовые токены сброса пароля: выпуск, проверка без погашения и атомарное погашение                                                   |
| [modules/role](../src/modules/role/README.md)                                   | Роли и наборы их прав: API управления ролями и идемпотентный засев ролей по умолчанию                                                    |
| [modules/session](../src/modules/session/README.md)                             | Сессии устройств: выдача и ротация refresh-токена, завершение с немедленным отзывом access-токена, фоновая очистка                       |
| [modules/socket](../src/modules/socket/README.md)                               | Инфраструктура реального времени на Socket.IO: JWT-подключение, присутствие, типизированный эмиттер, комнаты и проверка входящих событий |
| [modules/storage](../src/modules/storage/README.md)                             | Реализации FileStorage (диск и S3) по ключам и раздача файлов по подписанным ссылкам                                                     |
| [modules/user](../src/modules/user/README.md)                                   | Аккаунты пользователей: контакты, привилегии, подтверждение и смена email, пароль, удаление, поиск, засев администратора                 |

## routing

| Модуль                              | О чём                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [routing](../src/routing/README.md) | Маршруты HTTP — сгенерированные tsoa routes.ts и swagger.json, Swagger UI и служебные маршруты проб и метрик. |
