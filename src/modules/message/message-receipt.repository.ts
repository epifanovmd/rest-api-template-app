import { EntityManager, In } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { EMessageStatus } from "./message.types";
import { MessageReceipt } from "./message-receipt.entity";

/** Порядок статусов для сравнения (только вперёд). */
const STATUS_ORDER: Record<EMessageStatus, number> = {
  [EMessageStatus.SENT]: 0,
  [EMessageStatus.DELIVERED]: 1,
  [EMessageStatus.READ]: 2,
};

@InjectableRepository(MessageReceipt)
export class MessageReceiptRepository extends BaseRepository<MessageReceipt> {
  /**
   * Upsert receipts: создать или обновить статус для пользователя.
   * Статус обновляется только "вперёд" (SENT → DELIVERED → READ),
   * никогда не понижается. Batch INSERT ... ON CONFLICT — один запрос.
   *
   * @returns id сообщений, чей receipt реально сменил статус (новые
   *   и продвинутые вперёд); повтор того же статуса их не возвращает.
   */
  async upsertReceipts(
    chatId: string,
    userId: string,
    messageIds: string[],
    status: EMessageStatus,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (messageIds.length === 0) return [];

    // VALUES ($5,$1,$2,$3), ($6,$1,$2,$3), ... — первые 4 параметра общие
    const params: unknown[] = [chatId, userId, status, STATUS_ORDER[status]];
    const valuesClauses = messageIds.map((messageId, i) => {
      params.push(messageId);

      return `($${5 + i}, $1, $2, $3)`;
    });

    const rows: Array<{ message_id: string }> = await (
      manager ?? this.manager
    ).query(
      `INSERT INTO message_receipts (message_id, chat_id, user_id, status)
       VALUES ${valuesClauses.join(", ")}
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
       WHERE $4 > (CASE message_receipts.status
         WHEN 'sent' THEN 0
         WHEN 'delivered' THEN 1
         WHEN 'read' THEN 2
         ELSE 0 END)
       RETURNING message_id`,
      params,
    );

    return rows.map(row => row.message_id);
  }

  /** Получить все receipts для конкретного сообщения с профилями пользователей. */
  async findByMessageId(messageId: string): Promise<MessageReceipt[]> {
    return this.find({
      where: { messageId },
      relations: { user: { profile: { avatar: true } } },
      order: { updatedAt: "ASC" },
    });
  }

  /** Получить receipts для нескольких сообщений. */
  async findByMessageIds(messageIds: string[]): Promise<MessageReceipt[]> {
    if (messageIds.length === 0) return [];

    return this.find({
      where: { messageId: In(messageIds) },
    });
  }

  /**
   * Получить агрегированный статус сообщения для группового чата.
   * Возвращает минимальный статус среди всех получателей.
   */
  async getAggregatedStatus(messageId: string): Promise<EMessageStatus> {
    const result = await this.createQueryBuilder("r")
      .select(
        `MIN(CASE r.status
          WHEN 'sent' THEN 0
          WHEN 'delivered' THEN 1
          WHEN 'read' THEN 2
          ELSE 0 END)`,
        "minOrder",
      )
      .where("r.messageId = :messageId", { messageId })
      .getRawOne<{ minOrder: number | null }>();

    const order = result?.minOrder ?? 0;

    if (order >= 2) return EMessageStatus.READ;
    if (order >= 1) return EMessageStatus.DELIVERED;

    return EMessageStatus.SENT;
  }

  /** Получить summary: сколько прочитало / доставлено для сообщения. */
  async getReceiptSummary(
    messageId: string,
  ): Promise<{ delivered: number; read: number; total: number }> {
    const rows = await this.createQueryBuilder("r")
      .select("r.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("r.messageId = :messageId", { messageId })
      .groupBy("r.status")
      .getRawMany<{ status: EMessageStatus; count: string }>();

    let delivered = 0;
    let read = 0;
    let total = 0;

    for (const row of rows) {
      const count = parseInt(row.count, 10);

      total += count;

      if (row.status === EMessageStatus.DELIVERED) {
        delivered += count;
      } else if (row.status === EMessageStatus.READ) {
        read += count;
        delivered += count; // read implies delivered
      }
    }

    return { delivered, read, total };
  }
}
