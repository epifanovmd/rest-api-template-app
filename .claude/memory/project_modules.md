---
name: Feature Modules Reference
description: Все 21 модуль проекта — entities, services, endpoints, events, socket. Полный справочник
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
├── feature.types.ts           # Enums, const objects
├── dto/                       # DTOs с static fromEntity()
├── validation/                # Zod schemas
├── events/                    # Domain events (EventBus)
├── feature.handler.ts         # ISocketHandler (client→server)
├── feature.listener.ts        # ISocketEventListener (EventBus→socket)
└── feature.service.test.ts    # Mocha + Chai + Sinon тесты
```

## 21 модуль (1 core + 20 feature)

### Инфраструктура
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| core | — | — | — | — |
| mailer | — | — | — | — |
| otp | Otp | — | — | — |
| reset-password-tokens | ResetPasswordTokens | — | — | — |
| file | File | 3 | FileUploaded | — |
| socket | — | — | — | 11 client + 52 server events |

### Пользователи и аутентификация
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| user | User | 15 | EmailVerified, PasswordChanged, UserDeleted, UserPrivilegesChanged, UsernameChanged | user:* events |
| profile | Profile, PrivacySettings | 9 | ProfileUpdated, PrivacySettingsUpdated, UserOnline, UserOffline | profile:updated, profile:privacy-changed, user:online, user:offline, presence:init |
| role | Role | 4 | — | — |
| permission | Permission | — | — | — |
| auth | — | 8 | UserLoggedIn, TwoFactorEnabled, TwoFactorDisabled | session:new, auth:2fa-changed |
| session | Session | 3 | SessionTerminated | session:terminated |
| biometric | Biometric | 5 | — | — |
| passkeys | Passkey, PasskeyChallenge | 4 | — | — |

### Мессенджер
| Модуль | Entities | Endpoints | Events | Socket |
|--------|----------|-----------|--------|--------|
| contact | Contact | 5 | ContactRequest, ContactAccepted, ContactRemoved, ContactBlocked, ContactUnblocked | contact:* events |
| chat | Chat, ChatMember, ChatInvite, ChatFolder | 26 | ChatCreated, ChatUpdated, ChatMemberJoined, ChatMemberLeft, ChatMemberRoleChanged, ChatPinned, ChatLastMessageUpdated | chat:* events |
| chat-moderation | — | 4 | ChatSlowMode, ChatMemberBanned, ChatMemberUnbanned | chat:slow-mode, chat:member:banned/unbanned |
| message | Message, MessageAttachment, MessageReaction, MessageMention | 14 (7 MessageCtrl + 7 ChatMessageCtrl) | MessageCreated, MessageUpdated, MessageDeleted, MessageRead, MessageDelivered, MessagePinned, MessageReaction | message:* events |
| poll | Poll, PollOption, PollVote | 5 (1 PollChatCtrl + 4 PollCtrl) | PollCreated, PollVoted, PollClosed | poll:voted, poll:closed |
| call | Call | 6 | CallInitiated, CallAnswered, CallDeclined, CallEnded, CallMissed | call:* + WebRTC signaling |
| bot | Bot, BotCommand, WebhookLog | 16 (13 BotCtrl + 3 BotApiCtrl) | BotCreated, BotUpdated, BotDeleted | webhook delivery |
| push | DeviceToken, NotificationSettings | 4 (2 DeviceCtrl + 2 NotifSettingsCtrl) | NotificationSettingsChanged | push:settings-changed |
| sync | SyncLog | 1 | — (подписка на ~10 событий) | sync:available |

## Controllers (21)

AuthController(8), UserController(15), ProfileController(9), RoleController(4), BiometricController(5), PasskeysController(4), ContactController(5), ChatController(26), ChatModerationController(4), MessageController(7), ChatMessageController(7), PollController(4), PollChatController(1), CallController(6), BotController(13), BotApiController(3), DeviceController(2), NotificationSettingsController(2), SessionController(3), SyncController(1), FileController(3)

## Services (29)

Core: TokenService, LoggerService
Auth: AuthService
User: UserService
Profile: ProfileService, PresenceService, PrivacySettingsService
Role: RoleService
File: FileService, MediaProcessorService
Bot: BotService, WebhookService
Call: CallService
Chat: ChatService, ChatModerationService
Contact: ContactService
Message: MessageService
Poll: PollService
Push: PushService, DeviceTokenService, NotificationSettingsService
Session: SessionService
Sync: SyncService
Socket: SocketEmitterService, SocketServerService
Biometric: BiometricService
Passkeys: PasskeysService
OTP: OtpService
ResetPassword: ResetPasswordTokensService

## Socket Handlers (5)

PresenceHandler, ProfileHandler, ChatHandler, MessageHandler, CallHandler

## Socket Listeners (14)

AuthListener, UserListener, ProfileListener, PresenceListener, ContactListener, ChatListener, ChatModerationListener, MessageListener, PollListener, CallListener, BotListener, PushListener, SessionListener, SyncListener

## Итого

- **31 entities**
- **132 REST endpoints** (21 controllers)
- **~48 EventBus событий**
- **63 socket событий** (11 client→server + 52 server→client)
- **~886 тестов** (45 test-файлов)
