import { Module } from "../../core";
import { SOCKET_EVENT_LISTENER, SOCKET_HANDLER } from "../socket";
import { PrivacySettingsRepository } from "./privacy-settings.repository";
import { PrivacySettingsService } from "./privacy-settings.service";
import { ProfileController } from "./profile.controller";
import { ProfileHandler } from "./profile.handler";
import { ProfileListener } from "./profile.listener";
import { ProfileRepository } from "./profile.repository";
import { ProfileService } from "./profile.service";

@Module({
  providers: [
    ProfileRepository,
    PrivacySettingsRepository,
    ProfileController,
    ProfileService,
    PrivacySettingsService,

    // Слушатели событий socket
    { provide: SOCKET_EVENT_LISTENER, useClass: ProfileListener },

    // Socket-обработчики (подписки клиентов)
    { provide: SOCKET_HANDLER, useClass: ProfileHandler },
  ],
})
export class ProfileModule {}
