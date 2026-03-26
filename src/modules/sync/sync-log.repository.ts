import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { SyncLog } from "./sync-log.entity";

@InjectableRepository(SyncLog)
export class SyncLogRepository extends BaseRepository<SyncLog> {
  async getChangesSince(
    userId: string,
    chatIds: string[],
    sinceVersion?: string,
    limit: number = 100,
  ) {
    const qb = this.createQueryBuilder("log")
      .where(
        "(log.userId = :userId OR log.userId IS NULL)",
        { userId },
      )
      .orderBy("log.version", "ASC")
      .take(limit + 1);

    if (chatIds.length > 0) {
      qb.andWhere(
        "(log.chatId IN (:...chatIds) OR log.chatId IS NULL)",
        { chatIds },
      );
    } else {
      qb.andWhere("log.chatId IS NULL");
    }

    if (sinceVersion) {
      qb.andWhere("log.version > :sinceVersion", { sinceVersion });
    }

    const results = await qb.getMany();
    const hasMore = results.length > limit;

    if (hasMore) results.pop();

    return { changes: results, hasMore };
  }

  async getLatestVersion(): Promise<string> {
    const result = await this.createQueryBuilder("log")
      .select("MAX(log.version)", "maxVersion")
      .getRawOne();

    return result?.maxVersion ?? "0";
  }
}
