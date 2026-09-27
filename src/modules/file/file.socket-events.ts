/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { IFileDto } from "./file.dto";

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Файл загружен (оригинал сохранён) — владельцу */
    "file:uploaded": (...args: [IFileDto]) => void;
    /** Фоновая обработка файла завершена (`ready` или `failed`) — владельцу */
    "file:processed": (...args: [IFileDto]) => void;
    /** Файл удалён — владельцу */
    "file:deleted": (...args: [{ id: string }]) => void;
  }
}
