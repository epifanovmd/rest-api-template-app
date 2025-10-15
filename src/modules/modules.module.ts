import "./modules.associations";

import { Container } from "inversify";

import { Module } from "../app.module";
import { AuthModule } from "./auth";
import { BiometricModule } from "./biometric";
import { DialogModule } from "./dialog";
import { DialogMembersModule } from "./dialog-members";
import { DialogMessagesModule } from "./dialog-messages";
import { FcmTokenModule } from "./fcm-token";
import { FileModule } from "./file";
import { MailerModule } from "./mailer";
import { OtpModule } from "./otp";
import { PasskeysModule } from "./passkeys";
import { PermissionModule } from "./permission";
import { ProfileModule } from "./profile";
import { ResetPasswordTokensModule } from "./reset-password-tokens";
import { RoleModule } from "./role";
import { SocketModule } from "./socket";
import { UserModule } from "./user";
import { UtilsModule } from "./utils";
// IMPORT MODULE HERE

export class ModulesModule implements Module {
  Configure(ioc: Container) {
    new AuthModule().Configure(ioc);
    new DialogModule().Configure(ioc);
    new DialogMembersModule().Configure(ioc);
    new DialogMessagesModule().Configure(ioc);
    new FcmTokenModule().Configure(ioc);
    new FileModule().Configure(ioc);
    new PasskeysModule().Configure(ioc);
    new UserModule().Configure(ioc);
    new ProfileModule().Configure(ioc);
    new RoleModule().Configure(ioc);
    new PermissionModule().Configure(ioc);
    new SocketModule().Configure(ioc);
    new UtilsModule().Configure(ioc);
    new MailerModule().Configure(ioc);
    new OtpModule().Configure(ioc);
    new ResetPasswordTokensModule().Configure(ioc);
    new BiometricModule().Configure(ioc);
    // CONFIGURE MODULE HERE
  }
}
