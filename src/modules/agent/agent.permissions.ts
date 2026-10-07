import { definePermissions } from "../permission";

/** Права модуля агентов; по умолчанию — только у admin (через `*`). */
export const AgentPermissions = definePermissions(
  "agent",
  { key: "agent", label: "Агенты" },
  {
    VIEW: { name: "agent:view", label: "Просмотр" },
    ENROLL: { name: "agent:enroll", label: "Токены регистрации" },
    COMMAND: { name: "agent:command", label: "Команды" },
    REVOKE: { name: "agent:revoke", label: "Отзыв" },
  },
);
