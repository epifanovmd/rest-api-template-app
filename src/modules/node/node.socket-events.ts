/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { INodeLoadDto, INodeMeshDto, NodeDto } from "./dto";

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Узел создан или изменён — комнаты `nodes`, `node_<id>` и своим лично. */
    "node:updated": (...args: [NodeDto]) => void;
    /** Узел удалён (или перестал быть своим) — те же адресаты. */
    "node:deleted": (...args: [{ id: string }]) => void;
    /**
     * Матрица связности пересчитана — комната `nodes` (все узлы) и лично
     * своим (только их узлы).
     */
    "node:mesh": (...args: [INodeMeshDto]) => void;
    /** Новая нагрузка узла — комнаты `nodes`, `node_<id>` и своим лично. */
    "node:load": (...args: [INodeLoadDto]) => void;
  }
}
