import "reflect-metadata";

import { CoreModule, Module } from "./core";
import { AuthModule } from "./modules/auth";
import { MailerModule } from "./modules/mailer";
import { PasskeysModule } from "./modules/passkeys";
import { OtpModule } from "./modules/otp";
import { ProfileModule } from "./modules/profile";
import { ResetPasswordTokensModule } from "./modules/reset-password-tokens";
import { SocketModule } from "./modules/socket";
import { UserModule } from "./modules/user";
import { WgCliModule } from "./modules/wg-cli";
import { WgPeerModule } from "./modules/wg-peer";
import { WgServerModule } from "./modules/wg-server";
import { WgStatisticsModule } from "./modules/wg-statistics";

/**
 * Root application module — WireGuard VPN Management API.
 *
 * Module order matters for bootstrappers:
 *   - WgStatisticsModule must come before SocketModule so that
 *     SOCKET_EVENT_LISTENER and SOCKET_HANDLER bindings are registered first.
 *   - SocketModule always last — SocketBootstrap starts the server.
 */
@Module({
  imports: [
    // Infrastructure
    CoreModule,

    // Utility modules
    MailerModule,
    OtpModule,
    ResetPasswordTokensModule,

    // User / Auth modules
    UserModule,
    ProfileModule,
    AuthModule,
    PasskeysModule,

    // WireGuard shared CLI services (no HTTP)
    WgCliModule,

    // WireGuard domain modules
    WgServerModule,
    WgPeerModule,

    // WireGuard statistics + socket events (must register before SocketModule)
    WgStatisticsModule,

    // Socket — last, so all ISocketHandler / ISocketEventListener are bound
    SocketModule,
  ],
})
export class AppModule {}
