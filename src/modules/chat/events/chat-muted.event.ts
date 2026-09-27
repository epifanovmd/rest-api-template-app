/** Пользователь изменил мут чата (личная настройка, user-scoped). */
export class ChatMutedEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    /** `null` — мут снят. */
    public readonly mutedUntil: Date | null,
  ) {}
}
