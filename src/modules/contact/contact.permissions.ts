import { definePermissions } from "../permission";

/** Права модуля контактов; по умолчанию — только у admin (через `*`). */
export const ContactPermissions = definePermissions(
  "contact",
  { key: "contact", label: "Контакты" },
  {
    VIEW: { name: "contact:view", label: "Просмотр любых контактов" },
    MANAGE: { name: "contact:manage", label: "Управление любыми контактами" },
    ALL: { name: "contact:*", label: "Все права на контакты" },
  },
);
