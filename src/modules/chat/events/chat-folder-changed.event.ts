import type { ChatFolderDto } from "../dto/chat-folder.dto";

export type TChatFolderChange = "created" | "updated" | "deleted";

/**
 * Папка пользователя создана, изменена или удалена (user-scoped). При
 * удалении чаты папки переходят в «без папки» без отдельных событий.
 */
export class ChatFolderChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly folderId: string,
    public readonly change: TChatFolderChange,
    /** `null` для `deleted`. */
    public readonly folder: ChatFolderDto | null,
  ) {}
}
