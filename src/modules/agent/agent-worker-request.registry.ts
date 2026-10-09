import { AgentsError, type WorkerRequest } from "agent-sdk/server";

import {
  Injectable,
  InternalServerErrorException,
  IWorkerRequestHandler,
  logger,
  WorkerRequestError,
} from "../../core";

/**
 * Обработчики запросов воркеров к серверу по типу (`WORKER_REQUEST_HANDLER`
 * модулей) и ответ на запрос (`onWorkerRequest` SDK). Заполняется
 * бутстрапером, а не инъекцией: обработчики могут зависеть от сервисов
 * агентов, и прямая зависимость `AgentRuntime` от них была бы циклом.
 *
 * Ответ воркеру: результат обработчика — `200 { data }`; отказ
 * (`WorkerRequestError`) — `422` с его кодом; нет обработчика —
 * `REQUEST_UNHANDLED`; воркер не из `workers` — `REQUEST_FORBIDDEN`;
 * сбой обработчика — `REQUEST_FAILED` без подробностей (они — в журнале).
 */
@Injectable()
export class AgentWorkerRequestRegistry {
  private readonly _handlers = new Map<string, IWorkerRequestHandler>();

  register(handlers: IWorkerRequestHandler[]): void {
    for (const handler of handlers) {
      if (this._handlers.has(handler.type)) {
        throw new InternalServerErrorException(
          `Запрос воркеров «${handler.type}» зарегистрирован дважды`,
        );
      }
      this._handlers.set(handler.type, handler);
    }
  }

  /** Зарегистрированные типы запросов. */
  get types(): string[] {
    return [...this._handlers.keys()];
  }

  /** Ответ на запрос воркера; отказ — `AgentsError` (SDK передаст его воркеру). */
  async handle(request: WorkerRequest): Promise<unknown> {
    const handler = this._handlers.get(request.type);

    if (!handler) {
      throw new AgentsError(
        "REQUEST_UNHANDLED",
        `Сервер не обрабатывает запросы ${request.type}`,
        404,
      );
    }
    if (handler.workers && !handler.workers.includes(request.worker)) {
      throw new AgentsError(
        "REQUEST_FORBIDDEN",
        `Запрос ${request.type} не принимается от воркера ${request.worker}`,
        403,
      );
    }

    try {
      return await handler.handle({
        id: request.id,
        agent: {
          id: request.agent.id,
          name: request.agent.name,
          labels: request.agent.labels,
        },
        worker: request.worker,
        type: request.type,
        data: request.data,
        signal: request.signal,
      });
    } catch (err) {
      if (err instanceof WorkerRequestError) {
        throw new AgentsError(err.code, err.message, 422);
      }
      logger.error(
        {
          err,
          agentId: request.agentId,
          worker: request.worker,
          type: request.type,
        },
        "[Agent] Обработчик запроса воркера упал",
      );
      throw new AgentsError(
        "REQUEST_FAILED",
        "Сервер не смог ответить на запрос",
        500,
      );
    }
  }
}
