import { inject } from "inversify";
import {
  Controller,
  Get,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import { ISyncResponseDto, ISyncSnapshotDto } from "./dto/sync.dto";
import { SyncService } from "./sync.service";

@Injectable()
@Tags("Sync")
@Route("api/sync")
export class SyncController extends Controller {
  constructor(@inject(SyncService) private _syncService: SyncService) {
    super();
  }

  /**
   * Получить изменения с указанной версии.
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
   * Получить полный snapshot для быстрого старта: все чаты, unread counts, текущая sync version.
   * Используется при первом запуске или после полного сброса кэша.
   * @summary Initial snapshot
   */
  @Security("jwt")
  @Get("snapshot")
  getSnapshot(@Request() req: KoaRequest): Promise<ISyncSnapshotDto> {
    const user = getContextUser(req);

    return this._syncService.getSnapshot(user.userId);
  }
}
