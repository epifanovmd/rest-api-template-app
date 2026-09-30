import { definePermissions } from "../permission";

/** Права модуля чатов; по умолчанию — только у admin (через `*`). */
export const ChatPermissions = definePermissions(
  "chat",
  { key: "chat", label: "Чаты" },
  {
    VIEW: { name: "chat:view", label: "Просмотр любых чатов" },
    MANAGE: { name: "chat:manage", label: "Управление любыми чатами" },
    ALL: { name: "chat:*", label: "Все права на чаты" },
  },
);
