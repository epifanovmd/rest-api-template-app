# REST API Messenger

Полнофункциональный backend мессенджера на TypeScript — аналог Telegram по возможностям. Koa + tsoa + inversify + TypeORM + PostgreSQL + Socket.IO.

## Возможности

**Аутентификация.** Регистрация по email/телефону, вход с поддержкой двухфакторной аутентификации (cloud password), биометрия (fingerprint/face через crypto-подпись), WebAuthn passkeys, сброс пароля через email. JWT access+refresh токены с ролевой моделью и wildcard-permissions (`chat:*` покрывает `chat:view` и `chat:manage`). Управление активными сессиями — просмотр устройств, завершение по одному или всех кроме текущей.

**Чаты.** Четыре типа: личные (direct), групповые, каналы (broadcast — только admin пишет, подписчики читают) и секретные (E2E encrypted). Групповые чаты и каналы поддерживают иерархию ролей (owner → admin → member → subscriber), invite-ссылки с лимитом использований и сроком действия, slow mode (ограничение частоты сообщений), бан участников. Каналы могут быть публичными с уникальным @username и поиском. Чаты можно закреплять, архивировать, мутить, раскладывать по пользовательским папкам.

**Сообщения.** Семь типов: текст, изображение, файл, голосовое, системное, опрос, стикер. Cursor-based пагинация, полнотекстовый поиск внутри чата и глобально. Редактирование, soft-delete, reply, forward. Статусы доставки: sent → delivered → read с real-time обновлением через socket. Реакции emoji, @-упоминания (конкретных пользователей и @all), закрепление сообщений. Отложенная отправка по расписанию. Самоуничтожающиеся сообщения с таймером. Link preview — автоматический парсинг OG-тегов при отправке URL. Inline keyboard для ботов.

**Медиа.** Загрузка файлов с автоматической генерацией thumbnail (sharp, 200x200 webp) для изображений. Медиа-галерея чата с фильтрацией по типу (фото/видео/файлы/аудио) и статистикой.

**Контакты.** Двусторонняя модель: отправка запроса, принятие, блокировка. Real-time уведомления о входящих запросах.

**Звонки.** Голосовые и видео через WebRTC — сервер выступает signaling relay (offer/answer/ICE candidate). Статусы: ringing → active → ended/missed/declined. История звонков с длительностью.

**Опросы.** Создание в чате с вариантами ответов (2-10). Анонимное или открытое голосование, одиночный или множественный выбор. Отзыв голоса, закрытие опроса.

**Стикеры.** Стикерпаки с превью и emoji-привязкой. Создание своих паков, поиск, рекомендуемые, добавление в избранное.

**Боты.** Полноценный Bot API. Создание бота с уникальным @username и 128-символьным токеном. Webhook с HMAC-SHA256 подписью и retry (1s→5s→25s). Боты отправляют/редактируют/удаляют сообщения через Bot API. Автоматический парсинг /commands. Inline keyboard в сообщениях.

**E2E шифрование.** Секретные чаты где сервер не видит содержимое. Загрузка identity + signed prekey + one-time prekeys. Обмен ключами и ratchet через socket relay. Push-уведомления показывают "Зашифрованное сообщение".

**Синхронизация.** Incremental sync protocol — клиент хранит версию, сервер отдаёт только дельту изменений (create/update/delete) по всем сущностям. Socket-уведомление о наличии новых данных.

**Push-уведомления.** Firebase Cloud Messaging (iOS/Android/Web). Регистрация устройств, настройки (mute all, звук, превью). Фильтрация мьютнутых чатов с bypass для @mention.

**Приватность.** Три уровня (все/контакты/никто) для: последний онлайн, номер телефона, аватар.

**Real-time.** 48 socket-событий: набор текста, доставка/прочтение, реакции, участники, звонки, sync, E2E key exchange. Персональные комнаты для мультиустройства.

## Технические детали

- **146 REST endpoints**, автодокументация Swagger UI (`/api-docs`)
- **35 entities**, **24 модуля**, модульный монолит с IoC
- **738 unit-тестов** (Mocha + Chai + Sinon)
- 5 guards (throttle, HTTPS, email verified, API key, IP whitelist)
- 9 middleware (helmet, CORS, rate limit, error handling, request logging)
- Zod-валидация на всех входных данных
- Event-driven архитектура (EventBus → Socket listeners)
- TypeORM migrations, connection pooling, transactions

## Быстрый старт

```bash
cp .env.example .env          # настроить PostgreSQL, JWT secret, SMTP
yarn install
yarn migration:run
yarn dev                       # http://localhost:8080
```

## Команды

```bash
yarn dev                  # Hot reload + auto-generates tsoa routes
yarn build                # Generate routes + Rollup build
yarn test                 # 738 тестов
yarn lint                 # ESLint
yarn generate             # tsoa routes + swagger.json
yarn migration:generate   # Generate migration from entity changes
yarn migration:run        # Apply pending migrations
```

## Docker

```bash
bash start.sh             # Run in docker container with postgres
```

## License

MIT
