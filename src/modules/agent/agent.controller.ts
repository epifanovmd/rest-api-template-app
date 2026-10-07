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
  ValidateBody,
  ValidateQuery,
} from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { AgentService } from "./agent.service";
import { EAgentStatus } from "./agent.types";
import { AgentCommandService } from "./agent-command.service";
import {
  AgentCommandDto,
  AgentDto,
  ICreateAgentCommandBody,
  IUpdateAgentBody,
} from "./dto";
import {
  CreateAgentCommandSchema,
  ListAgentsQuerySchema,
  PageQuerySchema,
  UpdateAgentSchema,
} from "./validation";

@Injectable()
@Tags("Agent")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agents")
export class AgentController extends Controller {
  constructor(
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {
    super();
  }

  /**
   * Агенты по имени. Живое состояние — в ответе по одному агенту.
   * @summary Список агентов
   */
  @Security("jwt", ["permission:agent:view"])
  @ValidateQuery(ListAgentsQuerySchema)
  @Get()
  listAgents(
    @Query() status?: EAgentStatus,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<AgentDto>> {
    return this._agents.list(status, offset, limit);
  }

  /**
   * Агент: версия, хост, возможности и живое состояние — последние `status`
   * (задачи, слоты, нагрузки) и `metrics` (CPU, память, GPU), пока агент на связи.
   * @summary Агент
   */
  @Security("jwt", ["permission:agent:view"])
  @Get("{id}")
  getAgent(@Path() id: UUID): Promise<AgentDto> {
    return this._agents.get(id);
  }

  /**
   * Отозвать агента: его сессия закрывается, учётные данные больше не
   * действуют. Повторный отзыв — 204.
   * @summary Отзыв агента
   */
  @Security("jwt", ["permission:agent:revoke"])
  @SuccessResponse(204, "No Content")
  @Post("{id}/revoke")
  async revokeAgent(
    @Path() id: UUID,
    @Request() req: KoaRequest,
  ): Promise<void> {
    await this._agents.revoke(id, getContextUser(req).userId);
    this.setStatus(204);
  }

  /**
   * Обновить агента до версии (по умолчанию — последней): команда
   * `agent.update` со сборкой под его ОС и архитектуру. Агент проверяет
   * sha256 и подпись, заменяет исполняемый файл и перезапускается после
   * доработки задач; не связавшаяся с сервером версия откатывается.
   * @summary Обновление агента
   */
  @Security("jwt", ["permission:agent:command"])
  @ValidateBody(UpdateAgentSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/update")
  async updateAgent(
    @Path() id: UUID,
    @Request() req: KoaRequest,
    @Body() body: IUpdateAgentBody,
  ): Promise<AgentCommandDto> {
    const command = await this._commands.createUpdate(
      id,
      body.version,
      getContextUser(req).userId,
    );

    this.setStatus(201);

    return command;
  }

  /**
   * Команды агента, новые первыми.
   * @summary Команды агента
   */
  @Security("jwt", ["permission:agent:view"])
  @ValidateQuery(PageQuerySchema)
  @Get("{id}/commands")
  listAgentCommands(
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<AgentCommandDto>> {
    return this._commands.list(id, offset, limit);
  }

  /**
   * Поручить агенту команду из объявленного им списка
   * (`capabilities.commands.names`): `agent.logs`, `agent.drain`,
   * `agent.update`. Агент без связи получит её после переподключения;
   * итог — в команде (`GET /agent-commands/{id}`, событие `agent:command`).
   * @summary Команда агенту
   */
  @Security("jwt", ["permission:agent:command"])
  @ValidateBody(CreateAgentCommandSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/commands")
  async createAgentCommand(
    @Path() id: UUID,
    @Request() req: KoaRequest,
    @Body() body: ICreateAgentCommandBody,
  ): Promise<AgentCommandDto> {
    const command = await this._commands.create(
      id,
      body,
      getContextUser(req).userId,
    );

    this.setStatus(201);

    return command;
  }
}
