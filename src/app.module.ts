import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { FileModule } from "./modules/file";
import { MailerModule } from "./modules/mailer";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { ProfileModule } from "./modules/profile";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SocketModule } from "./modules/socket";
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

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
