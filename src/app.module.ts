import "reflect-metadata";

import { DatabaseModule } from "./bootstrap/database.module";
import { CoreModule } from "./core/core.module";
import { Module } from "./core/decorators/module.decorator";
import { AuthModule } from "./modules/auth/auth.module";
import { BiometricModule } from "./modules/biometric/biometric.module";
import { DialogModule } from "./modules/dialog/dialog.module";
import { FcmTokenModule } from "./modules/fcm-token/fcm-token.module";
import { FileModule } from "./modules/file/file.module";
import { MailerModule } from "./modules/mailer/mailer.module";
import { OtpModule } from "./modules/otp/otp.module";
import { PasskeysModule } from "./modules/passkeys/passkeys.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens/reset-password-tokens.module";
import { SocketModule } from "./modules/socket/socket.module";
import { UserModule } from "./modules/user/user.module";
import { UtilsModule } from "./modules/utils/utils.module";

/**
 * Корневой модуль приложения.
 *
 * Порядок imports имеет значение только для bootstrappers:
 * - DatabaseModule первый — DataSource инициализируется до всего остального.
 * - SocketModule последний — Socket-сервер стартует после всех бизнес-модулей.
 *
 * Все провайдеры регистрируются в глобальном IoC контейнере.
 */
@Module({
  imports: [
    // Инфраструктура
    CoreModule,
    DatabaseModule,

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
