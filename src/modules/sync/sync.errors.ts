import { defineErrors } from "../../core";

export const SyncError = defineErrors("SYNC", {
  INVALID_VERSION: {
    status: 400,
    message: "Некорректная sinceVersion: ожидается неотрицательное целое",
  },
});
