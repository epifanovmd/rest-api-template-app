import type { EFileStatus } from "../file.types";

/** Фоновая обработка файла завершилась: `ready` или `failed`. */
export class FileProcessedEvent {
  constructor(
    public readonly fileId: string,
    public readonly ownerId: string | null,
    public readonly status: EFileStatus,
  ) {}
}
