import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { MailerModule } from "./modules/mailer";
import { OtpModule } from "./modules/otp";
import { PasskeysModule } from "./modules/passkeys";
import { ProfileModule } from "./modules/profile";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SocketModule } from "./modules/socket";
import { UserModule } from "./modules/user";
import { WgCliModule } from "./modules/wg-cli";
import { WgPeerModule } from "./modules/wg-peer";
import { WgServerModule } from "./modules/wg-server";
import { WgStatisticsModule } from "./modules/wg-statistics";

/**
 * Корневой модуль приложения — WireGuard VPN Management API.
 *
 * Порядок модулей важен для bootstrapper-ов:
 *   - WgStatisticsModule должен идти перед SocketModule, чтобы
 *     привязки SOCKET_EVENT_LISTENER и SOCKET_HANDLER были зарегистрированы первыми.
 *   - SocketModule всегда последний — SocketBootstrap запускает сервер.
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
    AuthModule,
    PasskeysModule,

    // Общие CLI-сервисы WireGuard (без HTTP)
    WgCliModule,

    // Доменные модули WireGuard
    WgServerModule,
    WgPeerModule,

    // Статистика WireGuard + socket-события (должен регистрироваться перед SocketModule)
    WgStatisticsModule,

    // Socket — последним, чтобы все ISocketHandler / ISocketEventListener были привязаны
    SocketModule,
  ],
})
export class AppModule {}
