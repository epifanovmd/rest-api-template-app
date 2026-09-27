/** Пользователь переместил чат в папку (user-scoped). */
export class ChatMovedToFolderEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    /** `null` — чат убран из папки. */
    public readonly folderId: string | null,
  ) {}
}
