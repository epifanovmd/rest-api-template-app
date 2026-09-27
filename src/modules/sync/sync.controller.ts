import { inject } from "inversify";
import {
  Controller,
  Get,
  Query,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import { ISyncResponseDto, ISyncVersionDto } from "./dto/sync.dto";
import { SyncService } from "./sync.service";

@Injectable()
@Tags("Sync")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/sync")
export class SyncController extends Controller {
  constructor(@inject(SyncService) private _syncService: SyncService) {
    super();
  }

  /**
   * Получить изменения с указанной версии (компактифицированные).
   * Если версия клиента устарела — вернёт requiresSnapshot: true.
   * @summary Incremental sync
   */
  @Security("jwt")
  @Get()
  getChanges(
    @Request() req: KoaRequest,
    @Query() sinceVersion?: string,
    @Query() limit?: number,
  ): Promise<ISyncResponseDto> {
    const user = getContextUser(req);

    return this._syncService.getChanges(user.userId, sinceVersion, limit);
  }

  /**
   * Получить текущую sync version.
   * Используется при первом запуске для установки начальной точки синхронизации.
   * @summary Current sync version
   */
  @Security("jwt")
  @Get("version")
  getVersion(): Promise<ISyncVersionDto> {
    return this._syncService.getCurrentVersion();
  }
}
