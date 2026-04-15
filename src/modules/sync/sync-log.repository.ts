import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { SyncLog } from "./sync-log.entity";

@InjectableRepository(SyncLog)
export class SyncLogRepository extends BaseRepository<SyncLog> {
  /**
   * Получить компактифицированные изменения (DISTINCT ON entity_key).
   *
   * UNION ALL — каждая ветка использует свой индекс:
   *   - user-scoped:  IDX_SYNC_USER_VERSION  (user_id, version)
   *   - scope-scoped: IDX_SYNC_SCOPE_VERSION (scope_id, version)
   *
   * Благодаря write-time compaction, DISTINCT ON почти всегда no-op:
   * большинство entity_key имеют ровно 1 запись. Дубликаты возможны
   * только в окне между INSERT и DELETE (~мс) при concurrent writes.
   */
  async getCompactedChangesSince(
    userId: string,
    scopeIds: string[],
    sinceVersion?: string,
    limit: number = 100,
  ): Promise<{ changes: SyncLog[]; hasMore: boolean }> {
    const params: unknown[] = [userId];
    let paramIdx = 2;

    // ── sinceVersion param (shared across branches) ──
    let sinceVersionParamIdx: number | null = null;

    if (sinceVersion) {
      sinceVersionParamIdx = paramIdx;
      params.push(sinceVersion);
      paramIdx += 1;
    }

    // ── User-scoped branch ──
    let userBranch = "SELECT * FROM sync_logs WHERE user_id = $1";

    if (sinceVersionParamIdx) {
      userBranch += ` AND version > $${sinceVersionParamIdx}`;
    }

    // ── Scope-scoped branch ──
    let scopeBranch: string | null = null;

    if (scopeIds.length > 0) {
      scopeBranch = `SELECT * FROM sync_logs WHERE user_id IS NULL AND scope_id = ANY($${paramIdx})`;
      params.push(scopeIds);
      paramIdx += 1;

      if (sinceVersionParamIdx) {
        scopeBranch += ` AND version > $${sinceVersionParamIdx}`;
      }
    }

    // ── DISTINCT ON compaction (safety net — обычно no-op) ──
    const unionQuery = scopeBranch
      ? `(${userBranch}) UNION ALL (${scopeBranch})`
      : userBranch;

    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (entity_key) *
        FROM (${unionQuery}) AS combined
        ORDER BY entity_key, version DESC
      ) AS compacted
      ORDER BY compacted.version ASC
      LIMIT $${paramIdx}
    `;

    params.push(limit + 1);

    const results: SyncLog[] = await this.query(query, params);

    const hasMore = results.length > limit;

    if (hasMore) results.pop();

    return { changes: results, hasMore };
  }

  // ── Write-time compaction ─────────────────────────────────────

  /**
   * Удалить старые версии конкретного entity_key.
   * Вызывается после каждого INSERT (fire-and-forget).
   * Использует индекс IDX_SYNC_ENTITY_KEY_VERSION.
   */
  async deleteOlderVersions(
    entityKey: string,
    currentVersion: string,
  ): Promise<number> {
    const result = await this.query(
      "DELETE FROM sync_logs WHERE entity_key = $1 AND version < $2",
      [entityKey, currentVersion],
    );

    return result?.[1] ?? 0;
  }

  // ── Background compaction (safety net) ────────────────────────

  /**
   * Фоновая компактификация: подчищает дубликаты, пропущенные write-time compaction.
   *
   * Использует ROW_NUMBER window function вместо GROUP BY + HAVING:
   * - Скопировано только на записи 1-24h назад (свежие данные + буфер)
   * - ROW_NUMBER PARTITION BY entity_key использует индекс (entity_key, version)
   * - Batch LIMIT предотвращает длинные блокировки
   */
  async compactDuplicates(): Promise<number> {
    let totalDeleted = 0;
    const BATCH_SIZE = 10_000;
    const MAX_ITERATIONS = 100; // guard: max 1M записей за один прогон

    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      const result = await this.query(
        `DELETE FROM sync_logs
         WHERE version IN (
           SELECT version FROM (
             SELECT version,
                    ROW_NUMBER() OVER (
                      PARTITION BY entity_key ORDER BY version DESC
                    ) AS rn
             FROM sync_logs
             WHERE created_at < NOW() - INTERVAL '1 hour'
               AND created_at > NOW() - INTERVAL '25 hours'
           ) ranked
           WHERE rn > 1
           LIMIT $1
         )`,
        [BATCH_SIZE],
      );

      const deleted = result?.[1] ?? 0;

      totalDeleted += deleted;

      if (deleted < BATCH_SIZE) break;
    }

    return totalDeleted;
  }

  // ── Version queries ───────────────────────────────────────────

  /** Получить текущую (максимальную) версию sync log. */
  async getLatestVersion(): Promise<string> {
    const result = await this.query(
      "SELECT MAX(version) AS version FROM sync_logs",
    );

    return result?.[0]?.version ?? "0";
  }

  /** Получить min и max версию одним запросом. */
  async getVersionRange(): Promise<{ oldest: string; latest: string }> {
    const result = await this.query(
      "SELECT MIN(version) AS oldest, MAX(version) AS latest FROM sync_logs",
    );

    return {
      oldest: result?.[0]?.oldest ?? "0",
      latest: result?.[0]?.latest ?? "0",
    };
  }

  // ── Retention cleanup ─────────────────────────────────────────

  /** Удалить записи старше указанной даты. */
  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .where("createdAt < :before", { before })
      .execute();

    return result.affected ?? 0;
  }
}
