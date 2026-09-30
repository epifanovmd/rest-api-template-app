import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { LONG_POLL_STATE, UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import {
  IClaimedJobDto,
  IClaimJobsBody,
  ICompleteJobBody,
  IFailJobBody,
  IHeartbeatJobBody,
  IHeartbeatResultDto,
  ISignalJobBody,
  IWorkerQueueStatusDto,
} from "./dto/worker.dto";
import { IWorkerCaller, JobsWorkerService } from "./jobs-worker.service";
import {
  ClaimJobsSchema,
  CompleteJobSchema,
  FailJobSchema,
  HeartbeatJobSchema,
  SignalJobSchema,
} from "./validation";

const callerOf = (req: KoaRequest): IWorkerCaller => ({
  scopes: getContextUser(req).permissions,
  keyId: getContextUser(req).sessionId ?? null,
});

/** Сигнал обрыва соединения: long-poll перестаёт ждать. */
const disconnectSignal = (req: KoaRequest): AbortSignal => {
  const controller = new AbortController();

  req.ctx.state[LONG_POLL_STATE] = true;
  req.ctx.req.once("close", () => controller.abort());

  return controller.signal;
};

/**
 * API внешних воркеров (любой язык). Аутентификация — API-ключ со scope
 * `worker:<queue>` (или `worker:*`); очередь должна быть объявлена внешней.
 * Протокол — `python/README.md`.
 */
@Injectable()
@Tags("Worker")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/worker")
export class JobsWorkerController extends Controller {
  constructor(
    @inject(JobsWorkerService) private readonly _worker: JobsWorkerService,
  ) {
    super();
  }

  /**
   * Внешние очереди и воркеры: кто брал задачи и на связи ли сейчас (брал в
   * последние 90 с). Для индикатора «воркер доступен» в интерфейсе.
   * @summary Статус воркеров
   */
  @Security("jwt")
  @Get("status")
  status(): Promise<IWorkerQueueStatusDto[]> {
    return this._worker.workersStatus();
  }

  /**
   * Взять задачи из очередей. Long-poll: без задач ждёт до `waitSeconds`
   * (не больше 25 с) и возвращает пустой список. Каждая задача выдаётся в
   * аренду на `leaseSeconds`; без heartbeat она вернётся в очередь.
   * @summary Взять задачи
   */
  @Security("apiKey", ["worker"])
  @ValidateBody(ClaimJobsSchema)
  @Post("jobs/claim")
  claim(
    @Request() req: KoaRequest,
    @Body() body: IClaimJobsBody,
  ): Promise<IClaimedJobDto[]> {
    return this._worker.claim(callerOf(req), body, disconnectSignal(req));
  }

  /**
   * Ждать сигнала задачи (long-poll до `waitSeconds`, не больше 25 с): ответ
   * приходит сразу, как только задачу отменили или попросили остановить.
   * Без сигнала — `{ cancel: false, stop: false }`, воркер спрашивает снова.
   * @summary Сигналы задачи
   */
  @Security("apiKey", ["worker"])
  @ValidateBody(SignalJobSchema)
  @Post("jobs/{id}/signal")
  signal(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ISignalJobBody,
  ): Promise<IHeartbeatResultDto> {
    return this._worker.signal(callerOf(req), id, body, disconnectSignal(req));
  }

  /**
   * Продлить аренду и сообщить прогресс. `cancel: true` — задачу отменили
   * или аренда потеряна: прекратить работу и не вызывать complete.
   * @summary Heartbeat задачи
   */
  @Security("apiKey", ["worker"])
  @ValidateBody(HeartbeatJobSchema)
  @Post("jobs/{id}/heartbeat")
  heartbeat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IHeartbeatJobBody,
  ): Promise<IHeartbeatResultDto> {
    return this._worker.heartbeat(callerOf(req), id, body);
  }

  /**
   * Завершить задачу с результатом. 409 — аренда потеряна или задачу
   * отменили: результат не принят.
   * @summary Завершить задачу
   */
  @Security("apiKey", ["worker"])
  @ValidateBody(CompleteJobSchema)
  @SuccessResponse(204, "No Content")
  @Post("jobs/{id}/complete")
  async complete(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ICompleteJobBody,
  ): Promise<void> {
    await this._worker.complete(callerOf(req), id, body);
    this.setStatus(204);
  }

  /**
   * Сообщить об ошибке. `retryable: false` — без повторов; иначе задача
   * повторяется по политике очереди.
   * @summary Ошибка задачи
   */
  @Security("apiKey", ["worker"])
  @ValidateBody(FailJobSchema)
  @SuccessResponse(204, "No Content")
  @Post("jobs/{id}/fail")
  async fail(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IFailJobBody,
  ): Promise<void> {
    await this._worker.fail(callerOf(req), id, body);
    this.setStatus(204);
  }
}
