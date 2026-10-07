import { inject } from "inversify";
import {
  Controller,
  Get,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { Injectable } from "../../core";
import { UUID } from "../../core/http";
import { AgentCommandService } from "./agent-command.service";
import { AgentCommandDto } from "./dto";

@Injectable()
@Tags("Agent")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agent-commands")
export class AgentCommandController extends Controller {
  constructor(
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {
    super();
  }

  /**
   * Команда: статус, вывод (хвост), итог.
   * @summary Команда агенту
   */
  @Security("jwt", ["permission:agent:view"])
  @Get("{id}")
  getAgentCommand(@Path() id: UUID): Promise<AgentCommandDto> {
    return this._commands.get(id);
  }

  /**
   * Отменить команду, ещё не получившую итог: итог агента после отмены не
   * принимается. Завершённая — 409.
   * @summary Отмена команды
   */
  @Security("jwt", ["permission:agent:command"])
  @SuccessResponse(204, "No Content")
  @Post("{id}/cancel")
  async cancelAgentCommand(@Path() id: UUID): Promise<void> {
    await this._commands.cancel(id);
    this.setStatus(204);
  }
}
