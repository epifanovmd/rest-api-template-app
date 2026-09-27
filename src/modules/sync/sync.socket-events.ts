/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
export interface ISocketSyncAvailablePayload {
  version: string;
}

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Доступны новые изменения для синхронизации */
    "sync:available": (...args: [ISocketSyncAvailablePayload]) => void;
  }
}
