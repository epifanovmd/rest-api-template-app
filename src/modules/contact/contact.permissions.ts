import { definePermissions } from "../permission";

/** Права модуля контактов; по умолчанию — только у admin (через `*`). */
export const ContactPermissions = definePermissions("contact", {
  VIEW: "contact:view",
  MANAGE: "contact:manage",
  ALL: "contact:*",
});
