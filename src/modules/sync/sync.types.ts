export enum ESyncEntityType {
  MESSAGE = "message",
  CHAT = "chat",
  CHAT_MEMBER = "chat_member",
  CONTACT = "contact",
  PROFILE = "profile",
  /** Закреплённое сообщение чата (scope = chatId). */
  MESSAGE_PIN = "message_pin",
  POLL = "poll",
  /** Личное закрепление чата в списке (user-scoped). */
  CHAT_PIN = "chat_pin",
  /** Папка чатов пользователя (user-scoped, id = folderId). */
  CHAT_FOLDER = "chat_folder",
  /** Папка, в которой лежит чат у пользователя (user-scoped, id = chatId). */
  CHAT_FOLDER_ITEM = "chat_folder_item",
  /** Личный мут чата (user-scoped, id = chatId). */
  CHAT_MUTE = "chat_mute",
}

export enum ESyncAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

/** Очередь retention-очистки журнала. */
export const SYNC_CLEANUP_QUEUE = "sync.cleanup";

/** Очередь фоновой компактификации журнала. */
export const SYNC_COMPACTION_QUEUE = "sync.compaction";

/** Сколько дней хранятся записи журнала. */
export const SYNC_RETENTION_DAYS = 90;
