/** Файл удалён; `ownerId` — чей список обновить. */
export class FileDeletedEvent {
  constructor(
    public readonly fileId: string,
    public readonly ownerId: string | null,
  ) {}
}
