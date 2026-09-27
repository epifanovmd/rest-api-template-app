import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import type { IFileUsageProbe } from "../file";
import { MessageAttachmentRepository } from "./message-attachment.repository";

/** Файл, прикреплённый к сообщению, нельзя удалить. */
@Injectable()
export class MessageFileUsageProbe implements IFileUsageProbe {
  constructor(
    @inject(MessageAttachmentRepository)
    private readonly _attachmentRepo: MessageAttachmentRepository,
  ) {}

  async filesInUse(fileIds: string[]): Promise<string[]> {
    const rows = await this._attachmentRepo.find({
      select: { fileId: true },
      where: { fileId: In(fileIds) },
    });

    return [...new Set(rows.map(row => row.fileId))];
  }
}
