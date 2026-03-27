import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { BotModule } from "./modules/bot/bot.module";
import { CallModule } from "./modules/call/call.module";
import { ChatModule } from "./modules/chat";
import { ChatModerationModule } from "./modules/chat/chat-moderation.module";
import { ContactModule } from "./modules/contact";
import { EncryptionModule } from "./modules/encryption/encryption.module";
import { FileModule } from "./modules/file";
import { LinkPreviewModule } from "./modules/link-preview/link-preview.module";
import { MailerModule } from "./modules/mailer";
import { MessageModule } from "./modules/message";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { PollModule } from "./modules/poll/poll.module";
import { ProfileModule } from "./modules/profile";
import { PushModule } from "./modules/push";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SessionModule } from "./modules/session/session.module";
import { SocketModule } from "./modules/socket";
import { SyncModule } from "./modules/sync/sync.module";
import { UserModule } from "./modules/user";

/**
 * Корневой модуль приложения.
 */
@Module({
  imports: [
    // Инфраструктура
    CoreModule,

    // Вспомогательные модули
    MailerModule,
    OtpModule,
    ResetPasswordTokensModule,

    // Модули пользователей / аутентификации
    UserModule,
    ProfileModule,
    FileModule,
    AuthModule,
    BiometricModule,
    PasskeysModule,
    EncryptionModule,

    // Мессенджер
    LinkPreviewModule,
    ContactModule,
    ChatModule,
    ChatModerationModule,
    MessageModule,
    PollModule,
    CallModule,
    BotModule,
    PushModule,
    SessionModule,
    SyncModule,

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
