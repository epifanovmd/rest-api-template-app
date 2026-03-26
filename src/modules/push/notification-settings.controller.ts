import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { NotificationSettingsDto } from "./dto";
import { NotificationSettingsService } from "./notification-settings.service";
import { UpdateNotificationSettingsSchema } from "./validation";

interface IUpdateNotificationSettingsBody {
  muteAll?: boolean;
  soundEnabled?: boolean;
  showPreview?: boolean;
}

@Injectable()
@Tags("Push")
@Route("api/notification")
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
