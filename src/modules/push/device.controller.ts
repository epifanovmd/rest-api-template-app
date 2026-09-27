import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
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
import { KoaRequest } from "../../types/koa";
import { DeviceTokenService } from "./device-token.service";
import { DeviceTokenDto } from "./dto";
import { IRegisterDeviceBody } from "./dto/push-request.dto";
import { RegisterDeviceSchema } from "./validation";

@Injectable()
@Tags("Push")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/device")
export class DeviceController extends Controller {
  constructor(
    @inject(DeviceTokenService) private _tokenService: DeviceTokenService,
  ) {
    super();
  }

  /**
   * Зарегистрировать устройство для push-уведомлений.
   * Токен привязывается к текущей сессии и удаляется при её завершении.
   * Токен, привязанный к другому пользователю, перепривязывается.
   * @summary Регистрация устройства
   */
  @Security("jwt")
  @ValidateBody(RegisterDeviceSchema)
  @Post()
  registerDevice(
    @Request() req: KoaRequest,
    @Body() body: IRegisterDeviceBody,
  ): Promise<DeviceTokenDto> {
    const user = getContextUser(req);

    return this._tokenService.registerToken(
      user.userId,
      user.sessionId,
      body.token,
      body.platform,
      body.deviceName,
    );
  }

  /**
   * Удалить своё устройство из push-уведомлений.
   * Чужой или несуществующий токен — 404.
   * @summary Удаление устройства
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{token}")
  async unregisterDevice(
    @Request() req: KoaRequest,
    @Path() token: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._tokenService.unregisterToken(user.userId, token);
  }
}
