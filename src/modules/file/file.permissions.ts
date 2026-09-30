import { definePermissions } from "../permission";

/**
 * Права файлов. Действия над файлом — с областью: право на все файлы или
 * `…:own` — только на свои (владелец). Свои права выдаются ролям `user` и
 * `guest` при засеве (`RoleService.seedDefaultPermissions`). Загрузка
 * отдельного права не требует: загруженный файл всегда свой.
 */
export const FilePermissions = definePermissions(
  "file",
  { key: "file", label: "Файлы" },
  {
    VIEW: { name: "file:view", label: "Просмотр и ссылки", scoped: true },
    DELETE: { name: "file:delete", label: "Удаление", scoped: true },
  },
);
