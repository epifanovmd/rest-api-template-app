/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { NotificationSettingsDto } from "./dto";

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Настройки уведомлений изменены */
    "push:settings-changed": (...args: [NotificationSettingsDto]) => void;
  }
}
