/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { PollDto } from "./dto/poll.dto";

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Голос в опросе */
    "poll:voted": (...args: [PollDto]) => void;
    /** Опрос закрыт */
    "poll:closed": (...args: [PollDto]) => void;
  }
}
