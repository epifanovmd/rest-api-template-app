import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { ChatModule } from "./modules/chat";
import { ContactModule } from "./modules/contact";
import { FileModule } from "./modules/file";
import { MailerModule } from "./modules/mailer";
import { MessageModule } from "./modules/message";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { ProfileModule } from "./modules/profile";
import { PushModule } from "./modules/push";
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

    // Мессенджер
    ContactModule,
    ChatModule,
    MessageModule,
    PushModule,

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
