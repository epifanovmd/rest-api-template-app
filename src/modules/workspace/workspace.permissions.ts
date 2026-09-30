import { definePermissions } from "../permission";

/** Права модуля пространств; по умолчанию — только у admin (через `*`). */
export const WorkspacePermissions = definePermissions(
  "workspace",
  { key: "workspace", label: "Рабочие пространства" },
  {
    MANAGE: {
      name: "workspace:manage",
      label: "Управление любыми пространствами",
    },
  },
);
