import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { DeviceTokenService } from "./device-token.service";
import { DeviceTokenDto } from "./dto";
import { EDevicePlatform } from "./push.types";
import { RegisterDeviceSchema } from "./validation";

interface IRegisterDeviceBody {
  token: string;
  platform: EDevicePlatform;
  deviceName?: string;
}

@Injectable()
@Tags("Push")
@Route("api/device")
export class DeviceController extends Controller {
  constructor(
    @inject(DeviceTokenService) private _tokenService: DeviceTokenService,
  ) {
    super();
  }

  /**
   * Зарегистрировать устройство для push-уведомлений.
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
      body.token,
      body.platform,
      body.deviceName,
    );
  }

  /**
   * Удалить устройство из push-уведомлений.
   * @summary Удаление устройства
   */
  @Security("jwt")
  @Delete("{token}")
  async unregisterDevice(@Path() token: string): Promise<void> {
    await this._tokenService.unregisterToken(token);
  }
}
