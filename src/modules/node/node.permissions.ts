import { definePermissions } from "../permission";

/**
 * Права узлов. Действия над узлом — с областью: право на все узлы или
 * `…:own` — только на свои (назначенный владелец или создатель). По
 * умолчанию — только у admin (через `*`). Права на агента узла
 * (`node:agent`, `node:logs`, `node:view`) открывают и маршруты агентов
 * для агента этого узла.
 */
export const NodePermissions = definePermissions(
  "node",
  { key: "node", label: "Узлы" },
  {
    VIEW: {
      name: "node:view",
      label: "Просмотр, метрики и связность",
      scoped: true,
    },
    CREATE: { name: "node:create", label: "Создание" },
    UPDATE: { name: "node:update", label: "Изменение", scoped: true },
    DELETE: { name: "node:delete", label: "Удаление", scoped: true },
    ASSIGN: {
      name: "node:assign",
      label: "Назначение и снятие владельца",
      scoped: true,
    },
    PROVISION: {
      name: "node:provision",
      label: "Установка и удаление агента (команда, SSH)",
      scoped: true,
    },
    AGENT: {
      name: "node:agent",
      label:
        "Агент узла: обновление, ключ, воркеры, их настройки и запросы к ним",
      scoped: true,
    },
    LOGS: { name: "node:logs", label: "Журнал агента", scoped: true },
  },
);
