/** Чат удалён (владельцем, последним участником или при удалении пользователя). */
export class ChatDeletedEvent {
  constructor(
    public readonly chatId: string,
    public readonly memberUserIds: string[],
    public readonly deletedBy: string | null,
  ) {}
}
