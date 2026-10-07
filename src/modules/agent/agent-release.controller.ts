import { inject } from "inversify";
import { Controller, Get, Response, Route, Security, Tags } from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { Injectable } from "../../core";
import { AgentReleaseService, IAgentRelease } from "./agent-release.service";

@Injectable()
@Tags("Agent")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agent-releases")
export class AgentReleaseController extends Controller {
  constructor(
    @inject(AgentReleaseService)
    private readonly _releases: AgentReleaseService,
  ) {
    super();
  }

  /**
   * Выпуски агента, новые первыми: сборки под ОС и архитектуры, sha256,
   * подпись. Агент, чей `codeHash` отличается от сборки своей платформы, —
   * кандидат на обновление (`POST /agents/{id}/update`).
   * @summary Выпуски агента
   */
  @Security("jwt", ["permission:agent:view"])
  @Get()
  listAgentReleases(): Promise<IAgentRelease[]> {
    return this._releases.list();
  }
}
