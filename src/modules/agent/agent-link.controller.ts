import { inject } from "inversify";
import type { Readable } from "stream";
import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Produces,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import { config } from "../../config";
import type { IErrorResponseDto } from "../../core";
import {
  getContextUser,
  Injectable,
  ThrottleGuard,
  UseGuards,
  ValidateBody,
} from "../../core";
import { longPollSignal } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { AgentService } from "./agent.service";
import { AgentEnrollmentService } from "./agent-enrollment.service";
import { AgentReleaseService } from "./agent-release.service";
import { AgentSyncService } from "./agent-sync.service";
import {
  IAgentSyncBody,
  IAgentSyncDto,
  IEnrollAgentBody,
  IEnrolledAgentDto,
} from "./dto";
import { AgentSyncSchema, EnrollAgentSchema } from "./validation";

/** Адрес агента: за доверенным прокси — первый `X-Forwarded-For`. */
const remoteIpOf = (req: KoaRequest): string | undefined =>
  config.server.trustProxy ? req.ip : req.socket.remoteAddress;

/**
 * API, которое вызывает сам агент (протокол ALP): регистрация, запасной
 * транспорт HTTP sync, загрузка сборок. Основной канал — WebSocket на
 * `GET /api/v1/agent-link` (вне спецификации: upgrade).
 */
@Injectable()
@Tags("AgentLink")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agent-link")
export class AgentLinkController extends Controller {
  constructor(
    @inject(AgentEnrollmentService)
    private readonly _enrollment: AgentEnrollmentService,
    @inject(AgentSyncService) private readonly _sync: AgentSyncService,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentReleaseService)
    private readonly _releases: AgentReleaseService,
  ) {
    super();
  }

  /**
   * Регистрация агента (вызывает сам агент при первом старте): токен
   * регистрации → учётные данные `agentId` и `secret` для
   * `Authorization: Agent <agentId>.<secret>`. Секрет — только в этом ответе.
   * @summary Регистрация агента
   */
  @UseGuards(ThrottleGuard(20, 60_000, "agent:enroll"))
  @ValidateBody(EnrollAgentSchema)
  @SuccessResponse(201, "Created")
  @Post("enroll")
  async enrollAgent(
    @Body() body: IEnrollAgentBody,
  ): Promise<IEnrolledAgentDto> {
    const enrolled = await this._enrollment.enroll(body);

    this.setStatus(201);

    return enrolled;
  }

  /**
   * Запасной транспорт канала (когда WebSocket недоступен): пачка сообщений
   * агента → доставки сервера. Первый запрос сессии — `hello` и
   * `sessionId: null`; без доставок ответ ждёт до `waitSeconds`.
   * @summary Обмен HTTP sync
   */
  @Security("agent")
  @ValidateBody(AgentSyncSchema)
  @Post("sync")
  async syncAgentLink(
    @Request() req: KoaRequest,
    @Body() body: IAgentSyncBody,
  ): Promise<IAgentSyncDto> {
    const agent = await this._agents.findActive(getContextUser(req).userId);

    return this._sync.exchange(
      agent,
      body,
      remoteIpOf(req),
      longPollSignal(req),
    );
  }

  /**
   * Файл сборки агента для самообновления (команда `agent.update`): агент
   * сверяет sha256 и подпись Ed25519.
   * @summary Сборка агента
   */
  @Security("agent")
  @Produces("application/octet-stream")
  @Get("releases/{version}/{os}/{arch}")
  async downloadAgentRelease(
    @Path() version: string,
    @Path() os: string,
    @Path() arch: string,
  ): Promise<Readable> {
    const stream = await this._releases.open(version, os, arch);

    this.setHeader("Content-Type", "application/octet-stream");

    return stream;
  }
}
