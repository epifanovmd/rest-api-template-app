import { defineErrors } from "../../core";

export const PermissionError = defineErrors("PERMISSION", {
  INVALID_DEFINITION: {
    status: 500,
    message: "Некорректное объявление прав модуля",
  },
});
