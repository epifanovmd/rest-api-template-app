/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { ContactDto } from "./dto/contact.dto";

export interface ISocketContactRemovedPayload {
  contactId: string;
}

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Запрос на добавление в контакты */
    "contact:request": (...args: [ContactDto]) => void;
    /** Контакт принят */
    "contact:accepted": (...args: [ContactDto]) => void;
    /** Контакт удалён */
    "contact:removed": (...args: [ISocketContactRemovedPayload]) => void;
    /** Контакт заблокирован */
    "contact:blocked": (...args: [ContactDto]) => void;
    /** Контакт разблокирован */
    "contact:unblocked": (...args: [ContactDto]) => void;
  }
}
