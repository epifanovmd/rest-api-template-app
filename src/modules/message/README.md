# Модуль Message

Сообщения мессенджера: отправка, редактирование, удаление (для всех и у себя), ответы и
пересылка, вложения, упоминания, реакции, закрепление, поиск, медиа-галерея, статусы
доставки и прочтения, счётчики непрочитанного.

---

## Структура файлов

```
src/modules/message/
├── message.module.ts
├── message.entity.ts                  # Message (messages)
├── message-attachment.entity.ts       # MessageAttachment (message_attachments)
├── message-reaction.entity.ts         # MessageReaction (message_reactions)
├── message-mention.entity.ts          # MessageMention (message_mentions)
├── message-receipt.entity.ts          # MessageReceipt (message_receipts)
├── message-deletion.entity.ts         # MessageDeletion (message_deletions, «удалить у себя»)
├── message.types.ts                   # EMessageType, EMessageStatus, EAttachmentStatus, CLIENT_MESSAGE_TYPES
├── message.errors.ts                  # MessageError: доменные коды MESSAGE_*
├── message.repository.ts              # keyset-лента (findOlder/findNewer/findAround), поиск, медиа
├── message-*.repository.ts
├── message.service.ts
├── message.controller.ts              # api/v1/message
├── chat-message.controller.ts         # api/v1/chat/{chatId}/…
├── message.handler.ts                 # socket: message:read, message:delivered (onValidated)
├── message.listener.ts                # EventBus → socket
├── message-file-usage.probe.ts        # файл во вложении нельзя удалить
├── dto/                               # MessageDto, MessageAttachmentDto, MediaItemDto, IMessagePageDto, …
├── events/
└── validation/                        # схемы HTTP и сокет-событий
```

---

## Entities

| Сущность            | Таблица               | Главное                                                                                                                                                                                           |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Message`           | `messages`            | `chatId`, `senderId` (SET NULL), `type`, `content`, `replyToId`, `forwardedFromId`, `status`, `isEdited`, `isDeleted` (soft delete), `isPinned`/`pinnedAt`/`pinnedById`, `keyboard` (jsonb, боты) |
| `MessageAttachment` | `message_attachments` | `messageId`, `fileId` — файл прикрепляется только к одному сообщению                                                                                                                              |
| `MessageReaction`   | `message_reactions`   | одна реакция пользователя на сообщение (unique `messageId, userId`)                                                                                                                               |
| `MessageMention`    | `message_mentions`    | `userId` или `isAll` (@all)                                                                                                                                                                       |
| `MessageReceipt`    | `message_receipts`    | статус доставки/прочтения на пользователя; меняется только вперёд                                                                                                                                 |
| `MessageDeletion`   | `message_deletions`   | сообщение скрыто у пользователя                                                                                                                                                                   |

Индексы `messages`: `IDX_MESSAGES_CHAT_CREATED_ID (chatId, createdAt, id)` — keyset-лента
чата; `IDX_MESSAGES_SENDER`.

---

## Endpoints (`@Security("jwt")`, `{id}`/`{chatId}` — UUID)

`api/v1/chat/{chatId}` (`ChatMessageController`):

| Метод  | Путь                                | Ответ                         | Описание                                                        |
| ------ | ----------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `POST` | `/message`                          | 201 `MessageDto`              | Отправка (правила ниже); slow mode — 429 + `Retry-After`        |
| `GET`  | `/message?cursor=&around=&limit=`   | `IMessagePageDto`             | История, от новых к старым (см. «Лента»)                        |
| `GET`  | `/message/search?q=&offset=&limit=` | `IPaginatedDto<MessageDto>`   | Поиск в чате; `q` — минимум 2 символа, `%`/`_` буквально        |
| `GET`  | `/message/pinned?offset=&limit=`    | `IPaginatedDto<MessageDto>`   | Закреплённые                                                    |
| `GET`  | `/media?type=&offset=&limit=`       | `IPaginatedDto<MediaItemDto>` | Медиа: `type` — MIME-префикс (image, video, audio) или document |
| `GET`  | `/media/stats`                      | `IMediaStatsDto`              | Счётчики медиа по типам                                         |
| `POST` | `/message/read`                     | 204                           | Отметить прочитанными                                           |

`api/v1/message` (`MessageController`):

| Метод    | Путь                        | Ответ                       | Описание                                                              |
| -------- | --------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `GET`    | `/search?q=&offset=&limit=` | `IPaginatedDto<MessageDto>` | Глобальный поиск по чатам пользователя                                |
| `PATCH`  | `/{id}`                     | `MessageDto`                | Редактирование: автор, только `text`, текущий участник                |
| `DELETE` | `/{id}?forAll=`             | 204                         | Для всех (автор или ADMIN/OWNER; опрос закрывается) или только у себя |
| `POST`   | `/{id}/reaction`            | 204                         | Своя реакция (замена)                                                 |
| `DELETE` | `/{id}/reaction`            | 204                         | Снять свою реакцию                                                    |
| `POST`   | `/{id}/pin`                 | `MessageDto`                | Закрепить: группа/канал — ADMIN/OWNER, direct — любой участник        |
| `DELETE` | `/{id}/pin`                 | 204                         | Открепить                                                             |
| `GET`    | `/{id}/receipts`            | `MessageReceiptDto[]`       | Кто получил/прочитал                                                  |

Списки — `IPaginatedDto<T>` (`offset` по умолчанию 0, `limit` 20, максимум 100).

---

## Лента сообщений (`IMessagePageDto`)

`{ items, nextCursor, prevCursor }`, `items` — от новых к старым. Курсор непрозрачен для
клиента (base64url от `{ t: createdAt, id, d: "older" | "newer" }`), пагинация — keyset
по `(createdAt, id)`: одинаковое время создания не теряет и не дублирует сообщения.

- без параметров — последние сообщения; `prevCursor = null`;
- `cursor=<nextCursor>` — более старые; `cursor=<prevCursor>` — более новые (прокрутка
  вниз из «оторванного» окна);
- `around=<messageId>` — окно вокруг сообщения (переход к ответу/поиску), курсоры в обе
  стороны; вместе с `cursor` — 400;
- `nextCursor`/`prevCursor = null` — в эту сторону страниц нет;
- `limit` — по умолчанию 50, максимум 100; испорченный курсор — 400
  `MESSAGE_INVALID_CURSOR`; `around` не из этого чата — 404 `MESSAGE_NOT_FOUND`.

---

## Правила

**Отправка (`sendMessage`)**

- Писать может участник; в канале — только ADMIN/OWNER (`MESSAGE_SEND_FORBIDDEN`).
- Клиент не отправляет `system`/`poll` (`MESSAGE_INVALID_TYPE`); внутренние вызовы
  передают `options.allowServiceTypes`.
- Direct с блокировкой в любую сторону — `MESSAGE_USER_BLOCKED`.
- Slow mode (не для ADMIN/OWNER): раньше срока — 429 `MESSAGE_SLOW_MODE`,
  `details.retryAfter`; контроллер выставляет `Retry-After`.
- `replyToId` — неудалённое сообщение этого чата (`MESSAGE_REPLY_NOT_FOUND`);
  `forwardedFromId` — неудалённое сообщение из чата, где отправитель состоит
  (`MESSAGE_FORWARD_NOT_FOUND`).
- `fileIds` — дубли схлопываются; файл существует и принадлежит отправителю
  (`MESSAGE_ATTACHMENT_NOT_FOUND`), загрузка завершена — не `pending`
  (409 `MESSAGE_ATTACHMENT_NOT_READY`, `details.fileIds`), ещё не прикреплён
  (`MESSAGE_ATTACHMENT_IN_USE`). Файл в `processing` прикрепить можно. Строки файлов
  блокируются `FOR UPDATE` до конца транзакции.
- `options.onCreated(em, message)` — записи в транзакции сообщения (так создаётся опрос).
- После транзакции, до событий: `lastMessage*` чата — условным UPDATE (старое не
  перетирает новое), `unread_count` получателей +1, скрытый direct снова виден.

**Удаление для всех** — условный `UPDATE … WHERE is_deleted = false`: повтор/гонка →
`MESSAGE_ALREADY_DELETED` без повторного декремента счётчиков.

**Прочтение** — только чужие неудалённые сообщения; `unread_count` уменьшается на число
receipts, реально перешедших в READ, одним UPDATE; `last_read_message_id` — только вперёд.
Больше 200 id за вызов не обрабатывается.

**Файлы в DTO** — ссылки подписываются пачкой через `FileUrlService`
(`collectMessageFiles` + `FileUrlService.buildWithFiles`) — в ответах, событиях сокета и payload sync:
`fileUrl`, `downloadUrl`, `thumbnailUrl` — подписанные, срок ограничен; `status`
вложения — `processing | ready | failed` из `File.status` (`pending` → `processing`).
Аватар автора (`sender.avatarUrl`) — тоже подписанная ссылка.

---

## Ошибки (`message.errors.ts`, коды `MESSAGE_*`)

`NOT_FOUND` 404, `INVALID_TYPE` 400, `SEND_FORBIDDEN` 403, `USER_BLOCKED` 403,
`SLOW_MODE` 429, `REPLY_NOT_FOUND` 400, `FORWARD_NOT_FOUND` 400,
`ATTACHMENT_NOT_FOUND` 400, `ATTACHMENT_NOT_READY` 409, `ATTACHMENT_IN_USE` 400,
`NOT_AUTHOR` 403, `NOT_EDITABLE` 400, `DELETED` 400, `ALREADY_DELETED` 400,
`DELETE_FORBIDDEN` 403, `PIN_FORBIDDEN` 403, `SEARCH_QUERY_TOO_SHORT` 400,
`INVALID_CURSOR` 400. Чат не найден / не участник — `CHAT_NOT_FOUND` / `CHAT_NOT_MEMBER`.

---

## DTO

- `MessageDto` — поля сообщения, `sender { id, firstName, lastName, avatarUrl }`,
  `replyTo`, `attachments`, `reactions { emoji, count, userIds }[]`, `mentions`, `poll`,
  `localId` (транзитный, для дедупликации оптимистичных сообщений).
  `MessageDto.fromEntity(entity, files)` — `files` — карта подписей `TSignedFiles`
  (обязательна); файла нет в карте — `fileUrl: ""`, прочие ссылки `null`.
- `MediaItemDto.fromEntity(entity, files)` — так же; `MessageReceiptDto.fromEntity(receipt, files)` —
  `user.avatarUrl` из карты (`collectReceiptFiles`).
- `MessageAttachmentDto` — `fileId`, `fileName`, `fileUrl`, `downloadUrl`, `fileType`,
  `fileSize`, `thumbnailUrl`, `status`, `width`, `height`, `duration`, `waveform`.
- `MediaItemDto`, `IMediaStatsDto`, `MessageReceiptDto`, `IMessagePageDto`.

---

## События (EventBus)

| Событие                 | Данные                                                                                      | Когда                          |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `MessageCreatedEvent`   | `message`, `chatId`, `memberUserIds`, `mentionedUserIds`, `mentionAll`, `localId?`, `poll?` | отправка (в т. ч. опроса)      |
| `MessageUpdatedEvent`   | `message`, `chatId`                                                                         | редактирование                 |
| `MessageDeletedEvent`   | `messageId`, `chatId`, `forAll`, `userId`                                                   | удаление для всех / у себя     |
| `MessageDeliveredEvent` | `messageIds`, `chatId`, `userId`                                                            | доставка                       |
| `MessageReadEvent`      | `chatId`, `userId`, `messageIds`                                                            | только реально новые прочтения |
| `MessagePinnedEvent`    | `message`, `chatId`, `pinnedByUserId`                                                       | закрепление                    |
| `MessageUnpinnedEvent`  | `messageId`, `chatId`                                                                       | открепление                    |
| `MessageReactionEvent`  | `messageId`, `chatId`, `userId`, `emoji \| null`                                            | реакция поставлена / снята     |

Также эмитит `ChatLastMessageUpdatedEvent` модуля chat.

---

## Socket

Входящие (`MessageHandler`) — через `onValidated` модуля socket: схема, лимит частоты
на сокет, ack `{ ok: true }` / `{ ok: false, error: { code, message } }`.

| Событие             | Схема                                                                           | Лимит | Действие          |
| ------------------- | ------------------------------------------------------------------------------- | ----- | ----------------- |
| `message:read`      | `{ chatId: uuid, messageIds?: uuid[] ≤ 200, messageId?: uuid }` (старый формат) | 10/с  | `markAsRead`      |
| `message:delivered` | `{ chatId: uuid, messageIds: uuid[] ≤ 200 }`                                    | 10/с  | `markAsDelivered` |

Исходящие (`MessageListener`): `message:new` (+ `poll`, `localId`), `message:updated`,
`message:pinned` — в `chat_{chatId}`, `MessageDto` с подписанными ссылками;
`message:deleted` (в комнату или только автору «удаления у себя»), `message:unpinned`,
`message:reaction`, `message:status` (с `receiptSummary`) — в комнату; `chat:unread` —
лично участникам.

---

## Конфиг

Своих переменных нет. Срок подписанных ссылок — настройка хранилища
(`STORAGE_SIGNED_URL_TTL_SECONDS`).

---

## Зависимости

- **chat** — `ChatRepository`, `ChatMemberRepository`, `ChatService`, `ChatError`,
  `ChatLastMessageUpdatedEvent` (импорт по файлам: chat зависит от message
  через сид).
- **file** — `File`, `EFileStatus`, `FileUrlService`, `TSignedFiles`, `signedUrlOf`, `FILE_USAGE_PROBE`.
- **contact** — `UserBlockService`; **poll** — `PollRepository`, `PollDto`.
- **socket** — `onValidated`, `SocketEmitterService`.
- Используют: poll (`sendMessage` с `onCreated`), sync, push, bot, chat (сид).
