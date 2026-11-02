import { defineErrors } from "../../core";

export const SocketError = defineErrors("SOCKET", {
  RATE_LIMITED: { status: 429, message: "Слишком частые события" },
  INTERNAL: { status: 500, message: "Ошибка обработки события" },
});
