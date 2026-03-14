import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { BiometricModule } from "./modules/biometric";
import { DialogModule } from "./modules/dialog";
import { FcmTokenModule } from "./modules/fcm-token";
import { FileModule } from "./modules/file";
import { MailerModule } from "./modules/mailer";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { ProfileModule } from "./modules/profile";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SocketModule } from "./modules/socket";
import { UserModule } from "./modules/user";
import { UtilsModule } from "./modules/utils";

/**
 * Корневой модуль приложения.
 *
 * Порядок imports имеет значение только для bootstrappers:
 * - SocketModule последний — Socket-сервер стартует после всех бизнес-модулей.
 *
 * Все провайдеры регистрируются в глобальном IoC контейнере.
 */
@Module({
  imports: [
    // Инфраструктура
    CoreModule,

    // Служебные модули (нет HTTP контроллеров)
    MailerModule,
    UtilsModule,
    OtpModule,
    ResetPasswordTokensModule,

    // Доменные модули (с HTTP контроллерами)
    UserModule,
    ProfileModule,
    FileModule,
    AuthModule,
    BiometricModule,
    PasskeysModule,
    FcmTokenModule,
    DialogModule,

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener уже зарегистрированы
    SocketModule,
  ],
})
export class AppModule {}
