import { definePermissions } from "../permission";

/** Права модуля задач; по умолчанию — только у admin (через `*`). */
export const JobsPermissions = definePermissions("jobs", {
  /** Служебные операции с очередью: демо-задача проверки воркеров. */
  MANAGE: "jobs:manage",
});
