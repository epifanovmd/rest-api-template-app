import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto, IPaginatedDto } from "../../core";
import {
  getContextUser,
  Injectable,
  isSuperUser,
  ValidateBody,
  ValidateQuery,
} from "../../core";
import { longPollSignal, UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { IDemoEchoData } from "./demo-echo.handler";
import { JobRunDto } from "./dto/job-run.dto";
import { IJobViewer, JobsService } from "./jobs.service";
import { EJobRunStatus } from "./jobs.types";
import { DemoEchoSchema, ListJobsQuerySchema } from "./validation";

const viewerOf = (req: KoaRequest): IJobViewer => {
  const user = getContextUser(req);

  return { userId: user.userId, isSuperUser: isSuperUser(user) };
};

@Injectable()
@Tags("Jobs")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/jobs")
export class JobsController extends Controller {
  constructor(@inject(JobsService) private readonly _jobs: JobsService) {
    super();
  }

  /**
   * Видимые задачи: свои, либо задачи scope (`scopeType` + `scopeId`), если
   * политика scope разрешает просмотр. Новые — первыми.
   * @summary Список задач
   */
  @Security("jwt")
  @ValidateQuery(ListJobsQuerySchema)
  @Get()
  listJobs(
    @Request() req: KoaRequest,
    @Query() status?: EJobRunStatus,
    @Query() scopeType?: string,
    @Query() scopeId?: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<JobRunDto>> {
    return this._jobs.list(viewerOf(req), {
      status,
      scopeType,
      scopeId,
      offset,
      limit,
    });
  }

  /**
   * Задача: статус, прогресс, хвост лога, результат или ошибка.
   *
   * `waitSeconds` (0–25) — long-poll: незавершённую задачу сервер держит
   * запрос открытым и отвечает, как только она завершится, или через
   * `waitSeconds` — с текущим прогрессом. Клиент повторяет запрос, пока статус
   * не итоговый: так результат ждут сколько угодно без таймаутов прокси.
   * @summary Задача
   * @param waitSeconds Сколько ждать завершения, секунд (0 — не ждать, не больше 25)
   */
  @Security("jwt")
  @Get("{id}")
  getJob(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() waitSeconds?: number,
  ): Promise<JobRunDto> {
    return this._jobs.get(viewerOf(req), id, {
      waitSeconds,
      signal: waitSeconds ? longPollSignal(req) : undefined,
    });
  }

  /**
   * Отменить задачу: ждущая снимается сразу, выполняющаяся получает сигнал
   * отмены. Завершённую отменить нельзя (409).
   * @summary Отмена задачи
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Post("{id}/cancel")
  async cancelJob(@Request() req: KoaRequest, @Path() id: UUID): Promise<void> {
    await this._jobs.cancel(viewerOf(req), id);
    this.setStatus(204);
  }

  /**
   * Поставить демо-задачу `demo.echo` внешнему воркеру — проверка, что
   * воркеры подключены (`python/examples/echo_worker.py`). Только для админов.
   * @summary Проверка внешних воркеров
   */
  @Security("jwt", ["permission:jobs:demo"])
  @ValidateBody(DemoEchoSchema)
  @SuccessResponse(201, "Created")
  @Post("demo/echo")
  async demoEchoJob(
    @Request() req: KoaRequest,
    @Body() body: IDemoEchoData,
  ): Promise<{ jobId: string }> {
    this.setStatus(201);

    return this._jobs.enqueueDemoEcho(viewerOf(req), body);
  }
}
