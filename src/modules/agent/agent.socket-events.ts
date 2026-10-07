/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { IAlpMetrics, IAlpStatus } from "./agent-link.protocol";
import type { AgentCommandDto, AgentDto } from "./dto";

/** Живое состояние агента: новый `status` или `metrics`. */
export interface IAgentLiveSocketDto {
  agentId: string;
  status?: IAlpStatus;
  metrics?: IAlpMetrics;
}

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Агент зарегистрирован, на связи, пропал или отозван — в комнату `agents`. */
    "agent:updated": (...args: [AgentDto]) => void;
    /** Живое состояние агента — в комнату `agent_<id>`. */
    "agent:live": (...args: [IAgentLiveSocketDto]) => void;
    /** Команда агенту создана или сменила статус — в комнату `agent_<id>`. */
    "agent:command": (...args: [AgentCommandDto]) => void;
  }
}
