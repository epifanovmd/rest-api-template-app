import { In } from "typeorm";

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
   * никогда не понижается.
   *
   * Использует batch INSERT ... ON CONFLICT — один запрос на весь массив.
   */
  async upsertReceipts(
    chatId: string,
    userId: string,
    messageIds: string[],
    status: EMessageStatus,
  ): Promise<void> {
    if (messageIds.length === 0) return;

    const newOrder = STATUS_ORDER[status];

    // Batch INSERT с ON CONFLICT и conditional update
    // Строим VALUES ($1,$2,$3,$4), ($5,$2,$3,$4), ...
    const params: unknown[] = [chatId, userId, status, newOrder];
    const valuesClauses: string[] = [];

    for (let i = 0; i < messageIds.length; i += 1) {
      params.push(messageIds[i]);
      // messageId позиция: 5, 6, 7, ... (первые 4 — chatId, userId, status, order)
      const msgParam = `$${5 + i}`;

      valuesClauses.push(`(${msgParam}, $1, $2, $3)`);
    }

    await this.query(
      `INSERT INTO message_receipts (message_id, chat_id, user_id, status)
       VALUES ${valuesClauses.join(", ")}
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET
         status = CASE
           WHEN $4 > (CASE message_receipts.status
             WHEN 'sent' THEN 0
             WHEN 'delivered' THEN 1
             WHEN 'read' THEN 2
             ELSE 0 END)
           THEN EXCLUDED.status
           ELSE message_receipts.status
         END,
         updated_at = CASE
           WHEN $4 > (CASE message_receipts.status
             WHEN 'sent' THEN 0
             WHEN 'delivered' THEN 1
             WHEN 'read' THEN 2
             ELSE 0 END)
           THEN NOW()
           ELSE message_receipts.updated_at
         END`,
      params,
    );
  }

  /** Получить все receipts для конкретного сообщения с профилями пользователей. */
  async findByMessageId(messageId: string): Promise<MessageReceipt[]> {
    return this.find({
      where: { messageId },
      relations: { user: { profile: true } },
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
