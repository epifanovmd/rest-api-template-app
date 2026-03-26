---
name: Feature Modules Reference
description: Все 24 модуля проекта — entities, services, endpoints, events, socket, validation. Полный справочник
type: project
---

## Структура модуля

```
src/modules/feature/
├── feature.entity.ts          # TypeORM @Entity
├── feature.repository.ts      # @InjectableRepository, extends BaseRepository
├── feature.service.ts         # @Injectable, бизнес-логика
├── feature.controller.ts      # @Injectable, tsoa @Route
├── feature.module.ts          # @Module declaration
├── feature.types.ts           # Enums
├── dto/                       # DTOs с static fromEntity()
├── validation/                # Zod schemas
├── events/                    # Domain events
├── feature.handler.ts         # ISocketHandler (client→server)
└── feature.listener.ts        # ISocketEventListener (EventBus→socket)
```

---

## Auth Module

**Endpoints (8):** sign-up, sign-in, verify-2fa, enable-2fa, disable-2fa, request-reset-password, reset-password, refresh
**Rate limits:** sign-up 5/60s, sign-in 10/60s, reset 3/300s
**2FA flow:** signIn → require2FA → verify-2fa → tokens

## User Module

**Entity User:** id, email, phone, username(unique), passwordHash, emailVerified, twoFactorHash, twoFactorHint, challenge → roles(M2M), directPermissions(M2M), profile(O2O), biometrics/passkeys/otps(O2M)
**Endpoints (15):** my(GET/PATCH/DELETE), my/username, search, by-username, all, options, {id}, setPrivileges, requestVerifyEmail, verifyEmail, update, changePassword, delete
**Bootstrap:** AdminBootstrap — seed admin + permissions

## Profile Module

**Entity Profile:** userId(unique), firstName, lastName, birthDate, gender, status(online/offline), lastOnline → avatar(M2O→File)
**Entity PrivacySettings:** userId(unique), showLastOnline/showPhone/showAvatar (everyone/contacts/nobody)
**Endpoints (9):** my, my/update, my/privacy(GET/PATCH), my/delete, all, {userId}, update/{userId}, delete/{userId}
**Socket:** profile:subscribe → profile:updated

## Role Module

**Entity Role:** name(admin/user/guest) → permissions(M2M eager)
**Endpoints (2):** GET /roles, PATCH /{id}/permissions

## Permission Module

**Entity Permission:** name(EPermissions) → roles(M2M)
**Wildcards:** *, user:*, chat:*, contact:*, message:*

## OTP Module

**Entity Otp:** userId(PK), code(6 digits), expireAt
**Internal:** используется UserService для email verification

## Biometric Module

**Entity Biometric:** userId+deviceId(unique), publicKey, deviceName, challenge, challengeExpiresAt, lastUsedAt
**Endpoints (5):** register, generate-nonce, verify-signature, devices, delete/{deviceId}
**Лимит:** max 5 устройств. Challenge TTL 5 мин.

## Passkeys Module

**Entity Passkey:** id(credentialId), publicKey(Uint8Array), userId, counter, deviceType, transports, lastUsed
**Endpoints (4):** generate-registration-options(jwt), verify-registration(jwt), generate-authentication-options(public), verify-authentication(public)

## Encryption Module

**Entity UserKey:** userId+deviceId(unique), identityKey, signedPreKeyId/Public/Signature, isActive
**Entity OneTimePreKey:** userId+keyId(unique), publicKey, isUsed
**Endpoints (4):** POST keys, GET keys/{userId}, POST keys/prekeys, DELETE keys/{deviceId}
**Socket:** e2e:key-exchange, e2e:ratchet (client+server relay), e2e:prekeys-low (server)

## File Module

**Entity File:** id, name, type(MIME), url, size, thumbnailUrl, width, height
**Endpoints (3):** GET, POST(multipart upload), DELETE
**Thumbnails:** sharp — 200x200 webp при upload

## Link Preview Module

**Entity LinkPreview:** url(unique), title, description, imageUrl, siteName, fetchedAt
**Internal:** авто при sendMessage — cheerio OG-парсинг, кеш в БД → message.linkPreviews(jsonb)

## Contact Module

**Entity Contact:** userId+contactUserId(unique), displayName, status(pending/accepted/blocked)
**Двусторонняя модель:** addContact → 2 записи (initiator ACCEPTED, target PENDING)
**Endpoints (5):** POST(add), GET(list, ?status), PATCH accept, DELETE, POST block
**Socket:** contact:request, contact:accepted

## Chat Module

**Entity Chat:** type(direct/group/channel/secret), name, description, username(unique), isPublic, slowModeSeconds, avatarId, createdById, lastMessageAt
**Entity ChatMember:** chatId+userId(unique), role(owner/admin/member/subscriber), joinedAt, mutedUntil, lastReadMessageId, isPinnedChat, pinnedChatAt, isArchived, folderId
**Entity ChatInvite:** code(unique), chatId, expiresAt, maxUses, useCount, isActive
**Entity ChatFolder:** userId+name(unique), position

**Endpoints (29):**
- Создание: direct, group, channel, secret
- CRUD: list, get, update, delete(leave)
- Channel: update, subscribe, unsubscribe, search
- Invite: create, list, revoke, join
- Members: add, remove, update role
- UX: mute, pin/unpin, archive/unarchive, move to folder
- Folders: list, create, update, delete

**Moderation (4):** slow-mode, ban, unban, banned list

**Socket (14):** chat:join/leave/typing (client) + created/updated/typing/unread/member:joined/left/pinned/archived/slow-mode/member:banned/unbanned (server)

## Message Module

**Entity Message:** chatId, senderId, type(text/image/file/voice/system/poll/sticker), content, status(sent/delivered/read), replyToId, forwardedFromId, isEdited, isDeleted, isPinned, pinnedAt, pinnedById, stickerId, encryptedContent, encryptionMetadata(jsonb), keyboard(jsonb), linkPreviews(jsonb), scheduledAt, isScheduled, selfDestructSeconds, selfDestructAt
**Entity MessageAttachment:** messageId, fileId → file(eager)
**Entity MessageReaction:** messageId+userId(unique), emoji
**Entity MessageMention:** messageId, userId(nullable), isAll

**Endpoints (17):** send, list(cursor), search(in chat), pinned, media, media/stats, read, scheduled, cancel scheduled, global search, edit, delete, pin/unpin, reaction add/remove, open(self-destruct)

**Bootstrap:** MessageSchedulerBootstrap — 10s interval: scheduled send + self-destruct cleanup

**Socket (10):** message:read/delivered (client) + new/updated/deleted/reaction/pinned/unpinned/status/self-destructed (server)

## Poll Module

**Entities:** Poll(messageId unique, question, isAnonymous, isMultipleChoice, isClosed), PollOption(text, position), PollVote(pollId+optionId+userId unique)
**Endpoints (5):** create(in chat), vote, retract vote, close, get results
**Socket:** poll:voted, poll:closed

## Sticker Module

**Entities:** StickerPack(name, title, creatorId, isOfficial, isAnimated), Sticker(packId, emoji, fileId, position), UserStickerPack(userId+packId unique)
**Endpoints (9):** pack CRUD, search, featured, add/remove to user, add/delete sticker

## Call Module

**Entity Call:** callerId, calleeId, chatId?, type(voice/video), status(ringing/active/ended/missed/declined), startedAt, endedAt, duration
**Endpoints (6):** initiate, answer, decline, end, history, active
**WebRTC Socket (12):** offer/answer/ice-candidate/hangup (client) + incoming/answered/declined/ended/missed + offer/answer/ice-candidate relay (server)

## Bot Module

**Entity Bot:** ownerId, username(unique), displayName, description, avatarId, token(unique 128 hex), webhookUrl, webhookSecret, isActive
**Entity BotCommand:** botId+command(unique), description
**Management (10 jwt):** CRUD + token regenerate + webhook set/delete + commands set/get
**Bot API (3 bot-token):** message send/edit/delete
**Webhook:** HMAC-SHA256, retry 3x (1s→5s→25s), 10s timeout
**Listener:** MessageCreatedEvent → parse /commands → webhook delivery

## Push Module

**Entity DeviceToken:** userId, token(unique), platform(ios/android/web), deviceName
**Entity NotificationSettings:** userId(unique), muteAll, soundEnabled, showPreview
**Endpoints (4):** POST/DELETE device, GET/PATCH notification/settings
**PushService:** Firebase Admin SDK (FCM). Graceful если не настроен.
**PushListener:** MessageCreated → push offline (mute filter + mention bypass + encrypted hide). ContactRequest → push.

## Session Module

**Entity Session:** userId, refreshToken(unique), deviceName, deviceType, ip, userAgent, lastActiveAt
**Endpoints (3):** GET sessions, DELETE session, POST terminate-others
**Socket:** session:terminated

## Sync Module

**Entity SyncLog:** version(bigint auto), entityType(message/chat/chat_member/contact/profile), entityId, action(create/update/delete), userId?, chatId?, payload(jsonb)
**Endpoint (1):** GET /api/sync?sinceVersion=&limit=
**Listener:** подписка на все EventBus events → автоматическая запись
**Socket:** sync:available

## Mailer Module

**Internal.** Nodemailer + Gmail SMTP + EJS templates.
**Методы:** sendCodeMail(email, code), sendResetPasswordMail(email, token)

## Reset Password Tokens Module

**Entity:** userId(PK), token(JWT unique)
**Internal.** create(userId) → JWT, check(token) → verify + delete
