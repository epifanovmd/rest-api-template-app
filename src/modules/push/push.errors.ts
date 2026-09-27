import { defineErrors, HttpStatus } from "../../core";

/** Доменные ошибки push-уведомлений: коды `PUSH_*`. */
export const PushError = defineErrors("PUSH", {
  DEVICE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Устройство не найдено",
  },
  DELIVERY_FAILED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: "Сервис push-уведомлений недоступен",
  },
});
