import { definePermissions } from "../permission";

/** Права модуля задач; по умолчанию — только у admin (через `*`). */
export const JobsPermissions = definePermissions(
  "jobs",
  { key: "jobs", label: "Фоновые задачи" },
  {
    /** Служебная операция с очередью: демо-задача проверки воркеров. */
    DEMO: { name: "jobs:demo", label: "Проверка внешних воркеров" },
  },
);
