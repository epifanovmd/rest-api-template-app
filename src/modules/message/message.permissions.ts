import { definePermissions } from "../permission";

/** Права модуля сообщений; по умолчанию — только у admin (через `*`). */
export const MessagePermissions = definePermissions(
  "message",
  { key: "message", label: "Сообщения" },
  {
    VIEW: { name: "message:view", label: "Просмотр любых сообщений" },
    MANAGE: { name: "message:manage", label: "Управление любыми сообщениями" },
    ALL: { name: "message:*", label: "Все права на сообщения" },
  },
);
