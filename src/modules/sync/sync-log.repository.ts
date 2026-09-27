import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { SyncLog } from "./sync-log.entity";
import { SyncStateKey } from "./sync-state.entity";

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
    const { latest } = await this.getVersionState();

    return latest;
  }

  /**
   * Watermark retention и последняя версия одним запросом. `latest` не
   * меньше watermark: после полной очистки журнала версия не откатывается.
   */
  async getVersionState(): Promise<{ watermark: string; latest: string }> {
    const result = await this.query(
      `SELECT
         COALESCE((SELECT value FROM sync_state WHERE key = $1), 0) AS watermark,
         GREATEST(
           COALESCE((SELECT MAX(version) FROM sync_logs), 0),
           COALESCE((SELECT value FROM sync_state WHERE key = $1), 0)
         ) AS latest`,
      [SyncStateKey.RETENTION_WATERMARK],
    );

    return {
      watermark: String(result?.[0]?.watermark ?? "0"),
      latest: String(result?.[0]?.latest ?? "0"),
    };
  }

  // ── Retention cleanup ─────────────────────────────────────────

  /**
   * Удалить записи старше указанной даты и поднять watermark retention до
   * максимальной удалённой версии — в одной транзакции.
   */
  async deleteOlderThan(before: Date): Promise<number> {
    return this.manager.transaction(async manager => {
      const rows: Array<{ count: string; max: string | null }> =
        await manager.query(
          `WITH deleted AS (
             DELETE FROM sync_logs WHERE created_at < $1 RETURNING version
           )
           SELECT COUNT(*) AS count, MAX(version) AS max FROM deleted`,
          [before],
        );

      const count = Number(rows?.[0]?.count ?? 0);
      const max = rows?.[0]?.max;

      if (max != null) {
        await manager.query(
          `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value = GREATEST(sync_state.value, EXCLUDED.value),
                 updated_at = NOW()`,
          [SyncStateKey.RETENTION_WATERMARK, max],
        );
      }

      return count;
    });
  }
}
