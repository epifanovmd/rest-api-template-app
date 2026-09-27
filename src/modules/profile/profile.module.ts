import { Module } from "../../core";
import { asFileUsageProbe } from "../file";
import { SOCKET_EVENT_LISTENER, SOCKET_HANDLER } from "../socket";
import { PresenceHandler } from "./presence.handler";
import { PresenceListener } from "./presence.listener";
import { PresenceService } from "./presence.service";
import { PrivacySettings } from "./privacy-settings.entity";
import { PrivacySettingsRepository } from "./privacy-settings.repository";
import { PrivacySettingsService } from "./privacy-settings.service";
import { ProfileController } from "./profile.controller";
import { Profile } from "./profile.entity";
import { ProfileHandler } from "./profile.handler";
import { ProfileListener } from "./profile.listener";
import { ProfileRepository } from "./profile.repository";
import { ProfileService } from "./profile.service";
import { ProfileAvatarUsageProbe } from "./profile-avatar.probe";

@Module({
  entities: [Profile, PrivacySettings],
  providers: [
    ProfileRepository,
    PrivacySettingsRepository,
    ProfileController,
    ProfileService,
    PrivacySettingsService,
    PresenceService,
    asFileUsageProbe(ProfileAvatarUsageProbe),

    // Слушатели событий socket
    { provide: SOCKET_EVENT_LISTENER, useClass: ProfileListener },
    { provide: SOCKET_EVENT_LISTENER, useClass: PresenceListener },

    // Socket-обработчики (подписки клиентов)
    { provide: SOCKET_HANDLER, useClass: ProfileHandler },
    { provide: SOCKET_HANDLER, useClass: PresenceHandler },
  ],
})
export class ProfileModule {}
