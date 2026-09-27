import { definePermissions } from "../permission";

/** Права модуля пространств; по умолчанию — только у admin (через `*`). */
export const WorkspacePermissions = definePermissions("workspace", {
  MANAGE: "workspace:manage",
});
