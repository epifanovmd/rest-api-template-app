import "reflect-metadata";

import { CoreModule, Module, ObservabilityModule } from "./core";
import { AgentModule } from "./modules/agent";
import { ApiKeyModule } from "./modules/api-key";
import { AuditModule } from "./modules/audit";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { BotModule } from "./modules/bot/bot.module";
import { CallModule } from "./modules/call/call.module";
import { ChatModule } from "./modules/chat";
import { ChatModerationModule } from "./modules/chat/chat-moderation.module";
import { ContactModule } from "./modules/contact";
import { FileModule } from "./modules/file";
import { JobsModule } from "./modules/jobs";
import { MailerModule } from "./modules/mailer";
import { MessageModule } from "./modules/message";
import { NodeModule } from "./modules/node";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { PollModule } from "./modules/poll/poll.module";
import { ProfileModule } from "./modules/profile";
import { PushModule } from "./modules/push";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SessionModule } from "./modules/session/session.module";
import { SocketModule } from "./modules/socket";
import { StorageModule } from "./modules/storage";
import { SyncModule } from "./modules/sync/sync.module";
import { UserModule } from "./modules/user";

/**
 * Корневой модуль приложения.
 */
@Module({
  imports: [
    // Инфраструктура
    CoreModule,
    ObservabilityModule,
    StorageModule,
    JobsModule,
    AgentModule,

    // Вспомогательные модули
    MailerModule,
    OtpModule,
    ResetPasswordTokensModule,

    // Пользователи, доступ, аутентификация
    UserModule,
    ProfileModule,
    FileModule,
    AuthModule,
    SessionModule,
    ApiKeyModule,
    AuditModule,
    BiometricModule,
    PasskeysModule,

    // Модули проекта: узлы
    NodeModule,

    // Модули проекта: мессенджер
    ContactModule,
    ChatModule,
    ChatModerationModule,
    MessageModule,
    PollModule,
    CallModule,
    BotModule,
    PushModule,
    SyncModule,

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
