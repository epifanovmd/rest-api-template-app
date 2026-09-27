/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { PrivacySettingsDto, PublicProfileDto } from "./dto";

export interface ISocketUserPresencePayload {
  userId: string;
  lastOnline?: Date | null;
}

export interface ISocketPresenceInitPayload {
  onlineUserIds: string[];
}

declare module "../socket/socket.types" {
  interface ISocketEvents {
    "profile:subscribe": () => void;
  }

  interface ISocketEmitEvents {
    /** Изменение профиля */
    "profile:updated": (...args: [PublicProfileDto]) => void;
    /** Настройки приватности изменены */
    "profile:privacy-changed": (...args: [PrivacySettingsDto]) => void;
    /** Пользователь вышел в онлайн */
    "user:online": (...args: [ISocketUserPresencePayload]) => void;
    /** Пользователь ушёл в оффлайн */
    "user:offline": (...args: [ISocketUserPresencePayload]) => void;
    /** Начальный список онлайн-пользователей при подключении */
    "presence:init": (...args: [ISocketPresenceInitPayload]) => void;
  }
}
