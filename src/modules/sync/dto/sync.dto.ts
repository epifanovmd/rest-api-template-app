import { BaseDto } from "../../../core/dto/BaseDto";
import { ESyncAction, ESyncEntityType } from "../sync.types";
import { SyncLog } from "../sync-log.entity";

export class SyncLogDto extends BaseDto {
  version: string;
  entityType: ESyncEntityType;
  entityId: string;
  entityKey: string;
  action: ESyncAction;
  scopeId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;

  constructor(entity: SyncLog) {
    super(entity);

    this.version = entity.version;
    this.entityType = entity.entityType;
    this.entityId = entity.entityId;
    this.entityKey = entity.entityKey;
    this.action = entity.action;
    this.scopeId = entity.scopeId;
    this.payload = entity.payload;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: SyncLog) {
    return new SyncLogDto(entity);
  }
}

export interface ISyncResponseDto {
  changes: SyncLogDto[];
  currentVersion: string;
  hasMore: boolean;
  /**
   * true — версия клиента устарела, нужно сбросить кэш
   * и загрузить данные через обычные API endpoints заново.
   */
  requiresSnapshot: boolean;
}

export interface ISyncVersionDto {
  currentVersion: string;
}
