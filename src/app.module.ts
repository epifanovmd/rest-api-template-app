import "reflect-metadata";

import { CoreModule, Module, ObservabilityModule } from "./core";
import { ApiKeyModule } from "./modules/api-key";
import { AuditModule } from "./modules/audit";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { FileModule } from "./modules/file";
import { JobsModule } from "./modules/jobs";
import { MailerModule } from "./modules/mailer";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { ProfileModule } from "./modules/profile";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SessionModule } from "./modules/session/session.module";
import { SocketModule } from "./modules/socket";
import { StorageModule } from "./modules/storage";
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

    // Модули проекта

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
