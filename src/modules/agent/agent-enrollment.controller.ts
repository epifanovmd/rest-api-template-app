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
import { AgentEnrollmentService } from "./agent-enrollment.service";
import {
  AgentEnrollmentTokenDto,
  ICreatedEnrollmentTokenDto,
  ICreateEnrollmentTokenBody,
} from "./dto";
import { CreateEnrollmentTokenSchema, PageQuerySchema } from "./validation";

@Injectable()
@Tags("Agent")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/agent-enrollment-tokens")
export class AgentEnrollmentTokenController extends Controller {
  constructor(
    @inject(AgentEnrollmentService)
    private readonly _enrollment: AgentEnrollmentService,
  ) {
    super();
  }

  /**
   * Выпустить токен регистрации агентов. Полный токен (`token`) возвращается
   * только в этом ответе: он кладётся в конфигурацию агента. Многоразовый
   * токен (`maxUses` больше 1 или не задан) регистрирует парк машин.
   * @summary Токен регистрации агентов
   */
  @Security("jwt", ["permission:agent:enroll"])
  @ValidateBody(CreateEnrollmentTokenSchema)
  @SuccessResponse(201, "Created")
  @Post()
  async createEnrollmentToken(
    @Request() req: KoaRequest,
    @Body() body: ICreateEnrollmentTokenBody,
  ): Promise<ICreatedEnrollmentTokenDto> {
    const created = await this._enrollment.createToken(
      getContextUser(req).userId,
      body,
    );

    this.setStatus(201);

    return created;
  }

  /**
   * Токены регистрации, новые первыми. Секреты не возвращаются.
   * @summary Список токенов регистрации
   */
  @Security("jwt", ["permission:agent:enroll"])
  @ValidateQuery(PageQuerySchema)
  @Get()
  listEnrollmentTokens(
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<AgentEnrollmentTokenDto>> {
    return this._enrollment.listTokens(offset, limit);
  }

  /**
   * Отозвать токен: новые регистрации по нему невозможны, уже
   * зарегистрированные агенты продолжают работать. Повторный отзыв — 204.
   * @summary Отзыв токена регистрации
   */
  @Security("jwt", ["permission:agent:enroll"])
  @SuccessResponse(204, "No Content")
  @Post("{id}/revoke")
  async revokeEnrollmentToken(@Path() id: UUID): Promise<void> {
    await this._enrollment.revokeToken(id);
    this.setStatus(204);
  }
}
