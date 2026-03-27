---
name: Feature Modules Reference
description: Все 23 модуля проекта — entities, services, endpoints, events, socket, validation. Полный справочник
type: project
---

## Структура модуля

```
src/modules/feature/
├── feature.entity.ts          # TypeORM @Entity
├── feature.repository.ts      # @InjectableRepository, extends BaseRepository
├── feature.service.ts         # @Injectable, бизнес-логика, DataSource для транзакций
├── feature.controller.ts      # @Injectable, tsoa @Route
├── feature.module.ts          # @Module declaration
├── feature.types.ts           # Enums
├── dto/                       # DTOs с static fromEntity()
├── validation/                # Zod schemas
├── events/                    # Domain events (EventBus)
├── feature.handler.ts         # ISocketHandler (client→server)
├── feature.listener.ts        # ISocketEventListener (EventBus→socket)
└── feature.service.test.ts    # Mocha + Chai + Sinon тесты
```

## 23 модуля

### Инфраструктура
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| mailer | — | — | — | — |
| otp | Otp | — | — | — |
| reset-password-tokens | ResetPasswordTokens | — | — | — |
| file | File | 3 | FileUploaded | — |
| link-preview | LinkPreview | — | — | — |
| socket | — | — | — | 12 client + 53 server events |

### Пользователи и аутентификация
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| user | User | 15 | EmailVerified, PasswordChanged, UserDeleted, UserPrivilegesChanged, UsernameChanged | user:* events, session:terminated |
| profile | Profile, PrivacySettings | 8 | ProfileUpdated, PrivacySettingsUpdated | profile:updated, profile:privacy-changed |
| role | Role | 2 | — | — |
| permission | Permission | — | — | — |
| auth | — | 8 | UserLoggedIn, TwoFactorEnabled, TwoFactorDisabled | session:new, auth:2fa-changed |
| session | Session | 3 | SessionTerminated | session:terminated |
| biometric | Biometric | 5 | — | — |
| passkeys | Passkey | 4 | — | — |
| encryption | UserKey, OneTimePreKey | 4 | PrekeysLow, DeviceRevoked | e2e:prekeys-low, e2e:device-revoked |

### Мессенджер
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| contact | Contact | 5 | ContactRequest, ContactAccepted, ContactRemoved, ContactBlocked | contact:* events |
| chat | Chat, ChatMember, ChatInvite, ChatFolder | 34 | 10 событий (Created, Updated, MemberJoined/Left, Pinned, Archived, RoleChanged, SlowMode, Banned, Unbanned) | chat:* events |
| message | Message, MessageAttachment, MessageReaction, MessageMention | 17 | 9 событий (Created, Updated, Deleted, Read, Delivered, Pinned, Unpinned, Reaction, SelfDestruct) | message:* events |
| poll | Poll, PollOption, PollVote | 5 | PollCreated, PollVoted, PollClosed | message:new, poll:voted, poll:closed |
| call | Call | 6 | 5 событий (Initiated, Answered, Declined, Ended, Missed) | call:* + WebRTC signaling |
| bot | Bot, BotCommand | 13 | BotCreated, BotUpdated, BotDeleted | webhook delivery |
| push | DeviceToken, NotificationSettings | 4 | NotificationSettingsChanged | push:settings-changed |
| sync | SyncLog | 1 | — (подписка на ~10 событий) | sync:available |

## Итого

- **32 entities**
- **137 REST endpoints**
- **~50 EventBus событий**
- **65 socket событий** (12 client→server + 53 server→client)
- **718 тестов**
