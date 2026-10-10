import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { AgentService } from "./agent.service";
import {
  IAgentInstallCommandDto,
  IAgentReleaseDto,
  ICreateAgentInstallCommandBody,
} from "./dto";
import { CreateAgentInstallCommandSchema } from "./validation";

@Injectable()
@Tags("Agent")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agent-releases")
export class AgentReleaseController extends Controller {
  constructor(@inject(AgentService) private readonly _agents: AgentService) {
    super();
  }

  /**
   * Сборки, которые раздаёт бэкенд: агент и netprobe — из источника сборок
   * агента (по умолчанию GitHub, `remote` — версия и когда проверен),
   * воркеры проекта — из `release/` каталога архивов `AGENT_BUNDLE_DIR`; у каждой сборки — источник.
   * И кого из доступных агентов можно обновить: агентов и воркеры с сервера.
   * @summary Сборки агента
   */
  @Security("jwt")
  @Get()
  getAgentRelease(@Request() req: KoaRequest): Promise<IAgentReleaseDto> {
    return this._agents.release(getContextUser(req));
  }

  /**
   * Команда установки агента на новый узел одной строкой:
   * `curl …/api/v1/agent-bundle/install.sh | sudo sh -s -- --token …` — скрипт
   * ставит архив папки агента (`agent pack`): настройки, экземпляр, воркеры и
   * пакеты — из неё.
   * @summary Команда установки агента
   */
  @Security("jwt", ["permission:agent:enroll"])
  @ValidateBody(CreateAgentInstallCommandSchema)
  @Post("install-command")
  createAgentInstallCommand(
    @Body() body: ICreateAgentInstallCommandBody,
  ): IAgentInstallCommandDto {
    return this._agents.installCommand(body);
  }
}
