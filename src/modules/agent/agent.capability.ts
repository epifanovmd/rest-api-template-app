import type { TokenProvider } from "../../core";
import type {
  IAlpCapabilities,
  IAlpOutgoing,
  IAlpStatus,
  TAlpHello,
  TAlpOutgoingType,
} from "./agent-link.protocol";

/**
 * Токен multi-inject возможностей протокола агентов: модули регистрируют
 * `asAgentCapability(Cls)` — задачи (`jobs`), команды, желаемое состояние.
 * Модуль агентов о доменах не знает.
 */
export const AGENT_CAPABILITY = Symbol("AgentCapability");

/** Сессия агента, как её видят возможности. */
export interface IAgentSession {
  readonly agentId: string;
  readonly sessionId: string;
  readonly hello: TAlpHello;
  /** Последний `status` агента; `null` — ещё не присылал. */
  readonly status: IAlpStatus | null;
  readonly closed: boolean;
  /** Агент объявил возможность в `hello.capabilities`. */
  supports(capability: keyof IAlpCapabilities): boolean;
  /** Отправить агенту сообщение; `re` — id запроса, на который это ответ. */
  send<T extends TAlpOutgoingType>(
    type: T,
    data: IAlpOutgoing[T],
    re?: string,
  ): void;
}

/** Входящее сообщение после проверки схемы. */
export interface IAgentMessage<T = unknown> {
  type: string;
  id?: string;
  data: T;
}

/**
 * Возможность протокола: набор типов входящих сообщений и реакция на события
 * сессии. Исключение из `onMessage` уходит агенту `error` с `re` (4xx — без
 * повтора, иначе — повторить); успех надёжного сообщения — `ack`.
 */
export interface IAgentCapability {
  /** Типы входящих сообщений, которые обрабатывает возможность. */
  readonly handles: readonly string[];
  /** Сессия открыта (после `welcome`): сверить состояние и доставить ожидающее. */
  onOpen?(session: IAgentSession): Promise<void>;
  /**
   * Сессия восстановлена в другом процессе (HTTP sync без sticky): `hello`
   * не новый, сверку не повторять — только доставить ожидающее. Без метода
   * вызывается `deliver`.
   */
  onResume?(session: IAgentSession): Promise<void>;
  onMessage(session: IAgentSession, message: IAgentMessage): Promise<void>;
  /** Пришёл `status` агента. */
  onStatus?(session: IAgentSession, status: IAlpStatus): Promise<void>;
  /** Сигнал «агенту есть что доставить» (`AgentSignals`). */
  deliver?(session: IAgentSession): Promise<void>;
  onClose?(session: IAgentSession): Promise<void>;
}

export const asAgentCapability = (
  cls: new (...args: any[]) => IAgentCapability,
): TokenProvider<IAgentCapability> => ({
  provide: AGENT_CAPABILITY,
  useClass: cls,
});
