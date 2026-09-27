import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { NotificationSettingsDto } from "./dto";
import { IUpdateNotificationSettingsBody } from "./dto/push-request.dto";
import { NotificationSettingsService } from "./notification-settings.service";
import { UpdateNotificationSettingsSchema } from "./validation";

@Injectable()
@Tags("Push")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/notification")
export class NotificationSettingsController extends Controller {
  constructor(
    @inject(NotificationSettingsService)
    private _settingsService: NotificationSettingsService,
  ) {
    super();
  }

  /**
   * Получить настройки уведомлений текущего пользователя.
   * @summary Настройки уведомлений
   */
  @Security("jwt")
  @Get("settings")
  getSettings(@Request() req: KoaRequest): Promise<NotificationSettingsDto> {
    const user = getContextUser(req);

    return this._settingsService.getSettings(user.userId);
  }

  /**
   * Обновить настройки уведомлений.
   * @summary Обновление настроек уведомлений
   */
  @Security("jwt")
  @ValidateBody(UpdateNotificationSettingsSchema)
  @Patch("settings")
  updateSettings(
    @Request() req: KoaRequest,
    @Body() body: IUpdateNotificationSettingsBody,
  ): Promise<NotificationSettingsDto> {
    const user = getContextUser(req);

    return this._settingsService.updateSettings(user.userId, body);
  }
}
